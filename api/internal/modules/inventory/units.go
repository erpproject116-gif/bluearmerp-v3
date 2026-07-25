package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Unit struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

type UnitConversion struct {
	ID         int64   `json:"id"`
	FromUnitID int64   `json:"from_unit_id"`
	FromCode   string  `json:"from_code,omitempty"`
	ToUnitID   int64   `json:"to_unit_id"`
	ToCode     string  `json:"to_code,omitempty"`
	Factor     float64 `json:"factor"`
}

type unitBody struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active"`
}

type conversionBody struct {
	FromUnitID int64   `json:"from_unit_id"`
	ToUnitID   int64   `json:"to_unit_id"`
	Factor     float64 `json:"factor"`
}

func registerUnitRoutes(r chi.Router, pool *pgxpool.Pool) {
	// List: inventory.items so BOM/item UIs can load dropdowns without a separate grant.
	r.With(auth.RequirePermission("inventory.items", auth.AccessRead)).Get("/units", listUnits(pool))
	// Create/update: item editors can add custom UoMs on the fly (BOM / item master).
	r.With(auth.RequirePermission("inventory.items", auth.AccessWrite)).Post("/units", createUnit(pool))
	r.With(auth.RequirePermission("inventory.items", auth.AccessWrite)).Patch("/units/{id}", updateUnit(pool))
	r.With(auth.RequirePermission("inventory.items", auth.AccessRead)).Get("/unit-conversions", listUnitConversions(pool))
	r.With(auth.RequirePermission("inventory.units", auth.AccessWrite)).Post("/unit-conversions", upsertUnitConversion(pool))
	r.With(auth.RequirePermission("inventory.units", auth.AccessWrite)).Delete("/unit-conversions/{id}", deleteUnitConversion(pool))
}

func listUnits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "code", map[string]string{
			"code": "code", "name": "name", "updated_at": "updated_at",
		})
		offset := httputil.Offset(p)
		where := "tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and (code ilike $%d or name ilike $%d)", n, n)
			args = append(args, "%"+p.Q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st == "active" {
			where += " and is_active = true"
		} else if st == "inactive" {
			where += " and is_active = false"
		}
		order := "asc"
		if p.Order == "desc" {
			order = "desc"
		}
		orderCol := "code"
		if p.Sort == "name" || p.Sort == "updated_at" || p.Sort == "code" {
			orderCol = p.Sort
		}
		q := fmt.Sprintf(`
			select id, code, name, is_active, count(*) over() as total_count
			from public.inv_units
			where %s
			order by %s %s
			limit $%d offset $%d`, where, orderCol, order, n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list units.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Unit
		var total int64
		for rows.Next() {
			var row Unit
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.IsActive, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read units.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Unit{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createUnit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body unitBody
		if err := jsonDecode(r, &body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.Code)
		name := strings.TrimSpace(body.Name)
		if code == "" {
			response.Validation(w, map[string]string{"code": "Code is required."})
			return
		}
		if name == "" {
			name = code
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var row Unit
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_units (tenant_id, code, name, is_active)
			values ($1,$2,$3,$4)
			returning id, code, name, is_active`,
			tu.TenantID, code, name, active,
		).Scan(&row.ID, &row.Code, &row.Name, &row.IsActive)
		if err != nil {
			if strings.Contains(err.Error(), "inv_units") || strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"code": "Unit code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create unit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.unit.create", "inv_unit", &row.ID, nil, row)
		response.OK(w, row, "Created.")
	}
}

func updateUnit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body unitBody
		if err := jsonDecode(r, &body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.Code)
		name := strings.TrimSpace(body.Name)
		if code == "" {
			response.Validation(w, map[string]string{"code": "Code is required."})
			return
		}
		if name == "" {
			name = code
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var row Unit
		err = pool.QueryRow(r.Context(), `
			update public.inv_units
			set code=$1, name=$2, is_active=$3, updated_at=now()
			where id=$4 and tenant_id=$5
			returning id, code, name, is_active`,
			code, name, active, id, tu.TenantID,
		).Scan(&row.ID, &row.Code, &row.Name, &row.IsActive)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Unit not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update unit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.unit.update", "inv_unit", &id, nil, row)
		response.OK(w, row, "Updated.")
	}
}

func listUnitConversions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select c.id, c.from_unit_id, f.code, c.to_unit_id, t.code, c.factor::float8
			from public.inv_unit_conversions c
			join public.inv_units f on f.id = c.from_unit_id
			join public.inv_units t on t.id = c.to_unit_id
			where c.tenant_id = $1
			order by f.code, t.code`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list conversions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []UnitConversion
		for rows.Next() {
			var row UnitConversion
			if err := rows.Scan(&row.ID, &row.FromUnitID, &row.FromCode, &row.ToUnitID, &row.ToCode, &row.Factor); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read conversions.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []UnitConversion{}
		}
		response.OK(w, out, "OK")
	}
}

func upsertUnitConversion(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body conversionBody
		if err := jsonDecode(r, &body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.FromUnitID <= 0 || body.ToUnitID <= 0 {
			response.Validation(w, map[string]string{"from_unit_id": "Both units are required."})
			return
		}
		if body.FromUnitID == body.ToUnitID {
			response.Validation(w, map[string]string{"to_unit_id": "Units must differ."})
			return
		}
		if body.Factor <= 0 {
			response.Validation(w, map[string]string{"factor": "Factor must be greater than zero."})
			return
		}
		var n int
		_ = pool.QueryRow(r.Context(), `
			select count(*)::int from public.inv_units
			where tenant_id=$1 and id = any($2::bigint[])`,
			tu.TenantID, []int64{body.FromUnitID, body.ToUnitID}).Scan(&n)
		if n != 2 {
			response.Validation(w, map[string]string{"from_unit_id": "Units must belong to this business."})
			return
		}
		var row UnitConversion
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_unit_conversions (tenant_id, from_unit_id, to_unit_id, factor)
			values ($1,$2,$3,$4)
			on conflict (tenant_id, from_unit_id, to_unit_id) do update
			  set factor = excluded.factor, updated_at = now()
			returning id, from_unit_id, to_unit_id, factor::float8`,
			tu.TenantID, body.FromUnitID, body.ToUnitID, body.Factor,
		).Scan(&row.ID, &row.FromUnitID, &row.ToUnitID, &row.Factor)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save conversion.", "ERR_INTERNAL")
			return
		}
		_ = pool.QueryRow(r.Context(), `select code from public.inv_units where id=$1`, row.FromUnitID).Scan(&row.FromCode)
		_ = pool.QueryRow(r.Context(), `select code from public.inv_units where id=$1`, row.ToUnitID).Scan(&row.ToCode)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.unit_conversion.upsert", "inv_unit_conversion", &row.ID, nil, row)
		response.OK(w, row, "Saved.")
	}
}

func deleteUnitConversion(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.inv_unit_conversions where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Conversion not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.unit_conversion.delete", "inv_unit_conversion", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

// UnitQuerier is satisfied by *pgxpool.Pool and pgx.Tx.
type UnitQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ConvertQty converts qty from fromUnitID to toUnitID for the tenant.
// Same unit => 1. Uses direct conversion or inverse (1/factor).
func ConvertQty(ctx context.Context, q UnitQuerier, tenantID, fromUnitID, toUnitID int64, qty float64) (float64, error) {
	if fromUnitID <= 0 || toUnitID <= 0 {
		return 0, fmt.Errorf("unit is required for conversion")
	}
	if fromUnitID == toUnitID {
		return qty, nil
	}
	var factor float64
	err := q.QueryRow(ctx, `
		select factor::float8 from public.inv_unit_conversions
		where tenant_id=$1 and from_unit_id=$2 and to_unit_id=$3`,
		tenantID, fromUnitID, toUnitID).Scan(&factor)
	if err == nil {
		return qty * factor, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}
	err = q.QueryRow(ctx, `
		select factor::float8 from public.inv_unit_conversions
		where tenant_id=$1 and from_unit_id=$2 and to_unit_id=$3`,
		tenantID, toUnitID, fromUnitID).Scan(&factor)
	if err == pgx.ErrNoRows {
		var fromCode, toCode string
		_ = q.QueryRow(ctx, `select code from public.inv_units where id=$1`, fromUnitID).Scan(&fromCode)
		_ = q.QueryRow(ctx, `select code from public.inv_units where id=$1`, toUnitID).Scan(&toCode)
		return 0, fmt.Errorf("add conversion %s→%s (or reverse) under Inventory → Units", fromCode, toCode)
	}
	if err != nil {
		return 0, err
	}
	if factor <= 0 {
		return 0, fmt.Errorf("invalid conversion factor")
	}
	return qty / factor, nil
}

// ResolveLineUnit normalizes the unit captured on a document line.
// An explicit unit wins (its code is refreshed from the units master); otherwise
// the item base unit is used. Lines without an item keep whatever free text was sent.
func ResolveLineUnit(ctx context.Context, q UnitQuerier, tenantID int64, itemID *int64, unitID *int64, unitCode string) (*int64, *string) {
	code := strings.TrimSpace(unitCode)
	if unitID != nil && *unitID > 0 {
		var resolved string
		if err := q.QueryRow(ctx, `
			select code from public.inv_units where id=$1 and tenant_id=$2`,
			*unitID, tenantID).Scan(&resolved); err == nil {
			id := *unitID
			return &id, &resolved
		}
	}
	if itemID != nil && *itemID > 0 {
		baseID, baseCode, err := ItemBaseUnit(ctx, q, tenantID, *itemID)
		if err == nil && baseID > 0 {
			return &baseID, &baseCode
		}
	}
	if code == "" {
		return nil, nil
	}
	return nil, &code
}

// LookupUnitByCode resolves free-text unit text (imports, parsed documents) to a
// unit master row. Returns false when there is no active match.
func LookupUnitByCode(ctx context.Context, q UnitQuerier, tenantID int64, code string) (int64, string, bool) {
	code = strings.TrimSpace(code)
	if code == "" {
		return 0, "", false
	}
	var id int64
	var resolved string
	err := q.QueryRow(ctx, `
		select id, code from public.inv_units
		where tenant_id=$1 and is_active and lower(code)=lower($2)
		limit 1`, tenantID, code).Scan(&id, &resolved)
	if err != nil || id <= 0 {
		return 0, "", false
	}
	return id, resolved, true
}

// BaseQtyForLine converts a document line quantity into the item base unit so
// ledger writes stay in one unit. It fails closed: when the line carries a unit
// that cannot be reconciled with the item base unit, the caller gets an error
// instead of an unconverted quantity.
func BaseQtyForLine(ctx context.Context, q UnitQuerier, tenantID, itemID int64, lineUnitID *int64, qty float64) (float64, error) {
	if lineUnitID == nil || *lineUnitID <= 0 {
		return qty, nil
	}
	baseUnitID, _, err := ItemBaseUnit(ctx, q, tenantID, itemID)
	if err != nil {
		return 0, fmt.Errorf("item %d: base unit lookup failed", itemID)
	}
	if baseUnitID <= 0 {
		return 0, fmt.Errorf("item %d: set a base unit under Inventory → Items before posting stock", itemID)
	}
	if *lineUnitID == baseUnitID {
		return qty, nil
	}
	return ConvertQty(ctx, q, tenantID, *lineUnitID, baseUnitID, qty)
}

// ItemBaseUnit returns base_unit_id and code for an item.
func ItemBaseUnit(ctx context.Context, q UnitQuerier, tenantID, itemID int64) (unitID int64, code string, err error) {
	err = q.QueryRow(ctx, `
		select coalesce(i.base_unit_id, 0), coalesce(u.code, coalesce(nullif(trim(i.unit), ''), 'ea'))
		from public.inv_items i
		left join public.inv_units u on u.id = i.base_unit_id
		where i.id=$1 and i.tenant_id=$2 and i.deleted_at is null`, itemID, tenantID).Scan(&unitID, &code)
	return
}

func jsonDecode(r *http.Request, dest any) error {
	return json.NewDecoder(r.Body).Decode(dest)
}
