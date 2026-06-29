package inventory

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const (
	itemImportMaxRows  = 500
	itemImportMaxBytes = 5 << 20
)

var itemImportRequiredHeaders = []string{"item_name"}
var itemImportOptionalHeaders = []string{
	"purchase_price", "sales_price", "vip_price", "status",
	"track_serial", "track_lot", "track_inventory_qty", "warranty_duration_months",
}
var itemImportAllHeaders = append(append([]string{}, itemImportRequiredHeaders...), itemImportOptionalHeaders...)
var itemImportExample = []string{"Widget A", "100.00", "150.00", "140.00", "active", "true", "false", "true", "24"}

type importRowError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type importResult struct {
	Created   int              `json:"created"`
	Failed    int              `json:"failed"`
	RowErrors []importRowError `json:"row_errors,omitempty"`
}

type validatedImportRow struct {
	rowNum int
	body   itemBody
}

func itemImportTemplateHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="items-import-template.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write(itemImportAllHeaders)
		_ = cw.Write(itemImportExample)
		cw.Flush()
	}
}

func itemImportCSVHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if err := r.ParseMultipartForm(itemImportMaxBytes); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid upload."})
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "CSV file is required."})
			return
		}
		defer file.Close()

		records, err := csv.NewReader(file).ReadAll()
		if err != nil {
			response.Validation(w, map[string]string{"file": "Could not read CSV."})
			return
		}
		if len(records) < 2 {
			response.Validation(w, map[string]string{"file": "CSV must include a header row and at least one data row."})
			return
		}
		colIdx, err := mapCSVHeaders(records[0], itemImportRequiredHeaders)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}

		dataRows := records[1:]
		if len(dataRows) > itemImportMaxRows {
			response.Validation(w, map[string]string{"file": fmt.Sprintf("Maximum %d rows per import.", itemImportMaxRows)})
			return
		}

		result := importResult{}
		var valid []validatedImportRow
		for i, raw := range dataRows {
			rowNum := i + 2
			if isEmptyCSVRow(raw) {
				continue
			}
			row := extractCSVRow(raw, colIdx, itemImportAllHeaders)
			body, err := parseImportItemBody(row)
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: err.Error()})
				continue
			}
			valid = append(valid, validatedImportRow{rowNum: rowNum, body: body})
		}
		if len(valid) == 0 && result.Failed == 0 {
			response.Validation(w, map[string]string{"file": "No data rows found."})
			return
		}
		if len(valid) == 0 {
			msg := fmt.Sprintf("Imported 0 row(s); %d failed.", result.Failed)
			response.OK(w, result, msg)
			return
		}

		createdIDs, err := bulkImportItems(r.Context(), pool, tu, valid)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Import failed: "+err.Error(), "ERR_INTERNAL")
			return
		}
		result.Created = len(createdIDs)
		_ = audit.LogSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.item.import_batch", "inv_item", nil, nil, map[string]any{
			"imported_count":           result.Created,
			"skipped_validation_count": result.Failed,
			"created_ids":              createdIDs,
		})
		msg := fmt.Sprintf("Imported %d row(s).", result.Created)
		if result.Failed > 0 {
			msg = fmt.Sprintf("Imported %d row(s); %d failed validation.", result.Created, result.Failed)
		}
		response.OK(w, result, msg)
	}
}

func parseImportItemBody(row map[string]string) (itemBody, error) {
	purchase, err := parseCSVFloat(row["purchase_price"], "purchase_price")
	if err != nil {
		return itemBody{}, err
	}
	sales, err := parseCSVFloat(row["sales_price"], "sales_price")
	if err != nil {
		return itemBody{}, err
	}
	vip, err := parseCSVFloat(row["vip_price"], "vip_price")
	if err != nil {
		return itemBody{}, err
	}
	body := itemBody{
		ItemName:      row["item_name"],
		PurchasePrice: purchase,
		SalesPrice:    sales,
		VipPrice:      vip,
		Status:        row["status"],
	}
	if strings.TrimSpace(body.ItemName) == "" {
		return itemBody{}, fmt.Errorf("item name is required")
	}
	body.ItemName = strings.TrimSpace(body.ItemName)
	body.Status = defaultStatus(body.Status)
	if v := strings.TrimSpace(row["track_serial"]); v != "" {
		b, err := parseCSVBool(v, "track_serial")
		if err != nil {
			return itemBody{}, err
		}
		body.TrackSerial = &b
	}
	if v := strings.TrimSpace(row["track_lot"]); v != "" {
		b, err := parseCSVBool(v, "track_lot")
		if err != nil {
			return itemBody{}, err
		}
		body.TrackLot = &b
	}
	if v := strings.TrimSpace(row["track_inventory_qty"]); v != "" {
		b, err := parseCSVBool(v, "track_inventory_qty")
		if err != nil {
			return itemBody{}, err
		}
		body.TrackInventoryQty = &b
	}
	if v := strings.TrimSpace(row["warranty_duration_months"]); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return itemBody{}, fmt.Errorf("warranty_duration_months must be a non-negative integer")
		}
		body.WarrantyDurationMonths = &n
	}
	return body, nil
}

func bulkImportItems(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, rows []validatedImportRow) ([]int64, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var ids []int64
	for _, row := range rows {
		var code string
		if err := tx.QueryRow(ctx, `select public.allocate_tenant_code($1, $2)`, tu.TenantID, "item").Scan(&code); err != nil {
			return nil, err
		}
		var id int64
		err := tx.QueryRow(ctx, `
			insert into public.inv_items (tenant_id, item_code, item_name, purchase_price, sales_price, vip_price, warranty_duration_months, track_serial, track_lot, track_inventory_qty, status)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			returning id`,
			tu.TenantID, code, row.body.ItemName, row.body.PurchasePrice, row.body.SalesPrice, row.body.VipPrice,
			row.body.WarrantyDurationMonths, boolOrFalse(row.body.TrackSerial), boolOrFalse(row.body.TrackLot), boolOrFalse(row.body.TrackInventoryQty), row.body.Status).
			Scan(&id)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return ids, nil
}

func mapCSVHeaders(headerRow []string, expected []string) (map[string]int, error) {
	idx := map[string]int{}
	for i, h := range headerRow {
		key := strings.ToLower(strings.TrimSpace(h))
		if key == "" {
			continue
		}
		idx[key] = i
	}
	for _, col := range expected {
		if _, ok := idx[col]; !ok {
			return nil, fmt.Errorf("missing required column: %s", col)
		}
	}
	return idx, nil
}

func extractCSVRow(raw []string, colIdx map[string]int, headers []string) map[string]string {
	row := make(map[string]string, len(headers))
	for _, col := range headers {
		i := colIdx[col]
		if i < len(raw) {
			row[col] = strings.TrimSpace(raw[i])
		}
	}
	return row
}

func isEmptyCSVRow(row []string) bool {
	for _, c := range row {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

func parseCSVFloat(raw, field string) (float64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number", field)
	}
	return v, nil
}

func parseCSVBool(raw, field string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y":
		return true, nil
	case "0", "false", "no", "n":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be true/false, 1/0, or yes/no", field)
	}
}
