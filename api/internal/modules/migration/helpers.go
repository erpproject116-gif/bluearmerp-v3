package migration

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/csvmap"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

var allowedKinds = map[string]bool{
	"items": true, "partners": true, "accounts": true,
	"opening_stock": true, "open_si": true, "open_ap": true, "open_po": true, "in_transit": true,
	"open_quo": true, "open_so": true, "open_pr": true, "open_rfq": true,
}

type jobDefaults struct {
	TaxTypeID  int64
	CurrencyID int64
	LocationID int64
	DryRun     bool
}

func parseJobDefaults(r *http.Request) jobDefaults {
	return jobDefaults{
		TaxTypeID:  parseFormInt64(r, "tax_type_id"),
		CurrencyID: parseFormInt64(r, "currency_id"),
		LocationID: parseFormInt64(r, "location_id"),
		DryRun:     parseBoolDefault(r.FormValue("dry_run"), false),
	}
}

func parseFormInt64(r *http.Request, key string) int64 {
	v := strings.TrimSpace(r.FormValue(key))
	if v == "" {
		return 0
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0
	}
	return n
}

func readMapped(
	w http.ResponseWriter,
	r *http.Request,
	pool *pgxpool.Pool,
	kind string,
	required, canonical []string,
) ([]map[string]string, bool) {
	tu, _ := auth.FromContext(r.Context())
	records, colMap, err := csvmap.ReadUpload(r, csvmap.DefaultMaxBytes, func(profileID int64) (map[string]string, error) {
		m, e := loadProfileColumnMap(r.Context(), pool, tu.TenantID, profileID, kind)
		if e == errKindMismatch {
			return nil, fmt.Errorf("import profile kind does not match %s", kind)
		}
		return m, e
	})
	if err != nil {
		response.Validation(w, map[string]string{"file": err.Error()})
		return nil, false
	}
	remapped, err := csvmap.Remap(records, colMap, required, canonical)
	if err != nil {
		response.Validation(w, map[string]string{"column_map": err.Error()})
		return nil, false
	}
	rows := csvmap.RowsToMaps(remapped)
	if len(rows) > csvmap.DefaultMaxRows {
		response.Validation(w, map[string]string{"file": fmt.Sprintf("Maximum %d rows per import.", csvmap.DefaultMaxRows)})
		return nil, false
	}
	return rows, true
}

func writeImportResult(w http.ResponseWriter, result importResult, dryRun bool) {
	msg := "Import finished."
	if dryRun {
		msg = "Preview finished. No rows were written."
	}
	response.OK(w, result, msg)
}

func failRow(result *importResult, rowNum int, msg string) {
	result.Failed++
	result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: msg})
}

func parseTrackingPolicy(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "optional" {
		return "optional"
	}
	return "required"
}

type itemMatch struct {
	ID          int64
	Code        string
	Name        string
	TrackSerial bool
	TrackLot    bool
	TrackQty    bool
}

func lookupItem(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, tenantID int64, code, name string) (itemMatch, string) {
	code = strings.TrimSpace(code)
	name = strings.TrimSpace(name)
	var rows pgx.Rows
	var err error
	if code != "" {
		rows, err = q.Query(ctx, `
			select id, item_code, item_name,
			  coalesce(track_serial, false), coalesce(track_lot, false), coalesce(track_inventory_qty, true)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null and item_code = $2`, tenantID, code)
	} else if name != "" {
		rows, err = q.Query(ctx, `
			select id, item_code, item_name,
			  coalesce(track_serial, false), coalesce(track_lot, false), coalesce(track_inventory_qty, true)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null and lower(item_name) = lower($2)`, tenantID, name)
	} else {
		return itemMatch{}, "item is required"
	}
	if err != nil {
		return itemMatch{}, err.Error()
	}
	defer rows.Close()
	var hits []itemMatch
	for rows.Next() {
		var m itemMatch
		if err := rows.Scan(&m.ID, &m.Code, &m.Name, &m.TrackSerial, &m.TrackLot, &m.TrackQty); err != nil {
			return itemMatch{}, err.Error()
		}
		hits = append(hits, m)
	}
	if len(hits) == 0 {
		if code != "" {
			return itemMatch{}, fmt.Sprintf("unmatched item_code: %s", code)
		}
		return itemMatch{}, fmt.Sprintf("unmatched item: %s", name)
	}
	if len(hits) > 1 {
		return itemMatch{}, fmt.Sprintf("ambiguous item name: %s", name)
	}
	return hits[0], ""
}

func lookupPartner(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, tenantID int64, code, name, tin, wantKind string) (int64, string) {
	code = strings.TrimSpace(code)
	name = strings.TrimSpace(name)
	tin = strings.TrimSpace(tin)
	wantKind = strings.ToLower(strings.TrimSpace(wantKind))
	var rows pgx.Rows
	var err error
	if code != "" {
		rows, err = q.Query(ctx, `
			select id from public.inv_partners
			where tenant_id = $1 and deleted_at is null and partner_code = $2`, tenantID, code)
	} else if tin != "" {
		rows, err = q.Query(ctx, `
			select id from public.inv_partners
			where tenant_id = $1 and deleted_at is null and lower(coalesce(tin,'')) = lower($2)`, tenantID, tin)
	} else if name != "" {
		kindFilter := ""
		args := []any{tenantID, name}
		if wantKind == "customer" {
			kindFilter = ` and partner_kind in ('customer', 'both')`
		} else if wantKind == "vendor" {
			kindFilter = ` and partner_kind in ('vendor', 'both')`
		}
		rows, err = q.Query(ctx, `
			select id from public.inv_partners
			where tenant_id = $1 and deleted_at is null and lower(company_name) = lower($2)`+kindFilter, args...)
	} else {
		return 0, "partner is required"
	}
	if err != nil {
		return 0, err.Error()
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return 0, err.Error()
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		if code != "" {
			return 0, fmt.Sprintf("unmatched partner_code: %s", code)
		}
		if tin != "" {
			return 0, fmt.Sprintf("unmatched TIN: %s", tin)
		}
		return 0, fmt.Sprintf("unmatched partner: %s", name)
	}
	if len(ids) > 1 {
		return 0, fmt.Sprintf("ambiguous partner: %s", name)
	}
	return ids[0], ""
}

type entityCodeChecker interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// resolveEntityCode uses explicitCode when provided and unused; otherwise allocates via allocate_tenant_code.
func resolveEntityCode(ctx context.Context, q entityCodeChecker, tenantID int64, entityType, explicitCode string) (string, error) {
	explicitCode = strings.TrimSpace(explicitCode)
	if explicitCode != "" {
		var exists bool
		var checkSQL string
		switch entityType {
		case "item":
			checkSQL = `select exists(
			  select 1 from public.inv_items
			  where tenant_id = $1 and deleted_at is null and item_code = $2)`
		case "partner":
			checkSQL = `select exists(
			  select 1 from public.inv_partners
			  where tenant_id = $1 and deleted_at is null and partner_code = $2)`
		default:
			return "", fmt.Errorf("unknown entity type %q", entityType)
		}
		if err := q.QueryRow(ctx, checkSQL, tenantID, explicitCode).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return explicitCode, nil
		}
	}
	var code string
	if err := q.QueryRow(ctx, `select public.allocate_tenant_code($1, $2)`, tenantID, entityType).Scan(&code); err != nil {
		return "", err
	}
	return code, nil
}

func lookupLocation(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantID int64, name string) (int64, string) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, "location is required"
	}
	var id int64
	err := q.QueryRow(ctx, `
		select id from public.inv_locations
		where tenant_id = $1 and deleted_at is null and lower(location_name) = lower($2)
		limit 2`, tenantID, name).Scan(&id)
	if err != nil {
		return 0, fmt.Sprintf("unmatched location: %s", name)
	}
	return id, ""
}

func loadTaxType(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantID, taxTypeID int64) (taxcalc.TaxType, string) {
	if taxTypeID <= 0 {
		return taxcalc.TaxType{}, "tax_type_id is required"
	}
	var tt taxcalc.TaxType
	err := q.QueryRow(ctx, `
		select tax_mode, rate_percent::float8 from public.quo_tax_types
		where id = $1 and tenant_id = $2 and deleted_at is null`, taxTypeID, tenantID).Scan(&tt.TaxMode, &tt.RatePercent)
	if err != nil {
		return taxcalc.TaxType{}, "tax type not found"
	}
	return tt, ""
}

func alreadyImported(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantID int64, kind, sourceDocNo string) (bool, int64) {
	var id int64
	err := q.QueryRow(ctx, `
		select coalesce(document_id, 0) from public.mig_import_keys
		where tenant_id = $1 and kind = $2 and source_doc_no = $3`, tenantID, kind, sourceDocNo).Scan(&id)
	if err != nil {
		return false, 0
	}
	return true, id
}

func rememberImport(ctx context.Context, tx pgx.Tx, tenantID int64, kind, sourceDocNo string, documentID int64) error {
	_, err := tx.Exec(ctx, `
		insert into public.mig_import_keys (tenant_id, kind, source_doc_no, document_id)
		values ($1,$2,$3,$4)
		on conflict (tenant_id, kind, source_doc_no) do nothing`, tenantID, kind, sourceDocNo, documentID)
	return err
}

func requireJobDefaults(job jobDefaults, needTax, needCurrency, needLocation bool) string {
	if needTax && job.TaxTypeID <= 0 {
		return "Choose a tax type for this import (job default)."
	}
	if needCurrency && job.CurrencyID <= 0 {
		return "Choose a currency for this import (job default)."
	}
	if needLocation && job.LocationID <= 0 {
		return "Choose a warehouse/location for this import (job default)."
	}
	return ""
}

func lineUnitPrice(qty, amount float64) (float64, float64, string) {
	if amount <= 0 {
		return 0, 0, "amount must be greater than 0"
	}
	if qty <= 0 {
		return amount, 1, ""
	}
	return amount / qty, qty, ""
}

// lineUnitPriceOptional allows amount 0 (qty-only pipeline docs such as RFQ).
func lineUnitPriceOptional(qty, amount float64) (float64, float64, string) {
	if amount < 0 {
		return 0, 0, "amount cannot be negative"
	}
	if qty <= 0 {
		if amount > 0 {
			return amount, 1, ""
		}
		return 0, 0, "quantity must be greater than 0"
	}
	if amount == 0 {
		return 0, qty, ""
	}
	return amount / qty, qty, ""
}
