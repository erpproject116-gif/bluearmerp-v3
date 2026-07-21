package manufacturing

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type BomLine struct {
	ID              int64   `json:"id,omitempty"`
	LineNo          int     `json:"line_no"`
	ComponentItemID int64   `json:"component_item_id"`
	ComponentCode   string  `json:"component_code,omitempty"`
	ComponentName   string  `json:"component_name,omitempty"`
	Qty             float64 `json:"qty"`
	UnitID          *int64  `json:"unit_id,omitempty"`
	UnitCode        string  `json:"unit_code,omitempty"`
	ScrapQty        float64 `json:"scrap_qty"`
	BaseUnitID      int64   `json:"base_unit_id,omitempty"`
	BaseUnitCode    string  `json:"base_unit_code,omitempty"`
	StockQtyPreview float64 `json:"stock_qty_preview,omitempty"`
}

type Bom struct {
	ID                int64     `json:"id"`
	BomCode           string    `json:"bom_code"`
	BomName           string    `json:"bom_name"`
	FinishedItemID    int64     `json:"finished_item_id"`
	FinishedItemCode  string    `json:"finished_item_code,omitempty"`
	FinishedItemName  string    `json:"finished_item_name,omitempty"`
	DefaultLocationID *int64    `json:"default_location_id,omitempty"`
	DefaultLocation   string    `json:"default_location_name,omitempty"`
	OutputQty         float64   `json:"output_qty"`
	OutputUnitID      *int64    `json:"output_unit_id,omitempty"`
	OutputUnitCode    string    `json:"output_unit_code,omitempty"`
	YieldPct          float64   `json:"yield_pct"`
	IsActive          bool      `json:"is_active"`
	Notes             *string   `json:"notes,omitempty"`
	Components        string    `json:"components,omitempty"`
	Lines             []BomLine `json:"lines,omitempty"`
}

type bomBody struct {
	BomCode           string        `json:"bom_code"`
	BomName           string        `json:"bom_name"`
	FinishedItemID    int64         `json:"finished_item_id"`
	DefaultLocationID *int64        `json:"default_location_id"`
	OutputQty         *float64      `json:"output_qty"`
	OutputUnitID      *int64        `json:"output_unit_id"`
	YieldPct          *float64      `json:"yield_pct"`
	IsActive          *bool         `json:"is_active"`
	Notes             *string       `json:"notes"`
	Lines             []bomLineBody `json:"lines"`
}

type bomLineBody struct {
	ComponentItemID int64    `json:"component_item_id"`
	Qty             float64  `json:"qty"`
	UnitID          *int64   `json:"unit_id"`
	ScrapQty        *float64 `json:"scrap_qty"`
}

func listBoms(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"bom_code":   "b.bom_code",
		"bom_name":   "b.bom_name",
		"updated_at": "b.updated_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "bom_code", allowed)
		offset := httputil.Offset(p)

		where := "b.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and (b.bom_code ilike $%d or b.bom_name ilike $%d or fi.item_name ilike $%d)", argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if p.Status == "active" || p.Status == "inactive" {
			where += fmt.Sprintf(" and b.is_active = $%d", argN)
			args = append(args, p.Status == "active")
			argN++
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "b.bom_code"
		}
		q := fmt.Sprintf(`
			select b.id, b.bom_code, b.bom_name, b.finished_item_id,
			  coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
			  b.default_location_id, coalesce(loc.location_name, ''),
			  b.output_qty::float8, b.output_unit_id, coalesce(ou.code, ''),
			  b.yield_pct::float8, b.is_active, b.notes,
			  string_agg(
			    coalesce(ci.item_code, '') || ' × ' || l.qty::text || ' ' || coalesce(lu.code, coalesce(nullif(trim(ci.unit), ''), '')),
			    ', ' order by l.line_no
			  ),
			  count(*) over()
			from public.mfg_boms b
			join public.inv_items fi on fi.id = b.finished_item_id
			left join public.inv_locations loc on loc.id = b.default_location_id
			left join public.inv_units ou on ou.id = b.output_unit_id
			left join public.mfg_bom_lines l on l.bom_id = b.id
			left join public.inv_items ci on ci.id = l.component_item_id
			left join public.inv_units lu on lu.id = l.unit_id
			where %s
			group by b.id, fi.item_code, fi.item_name, loc.location_name, ou.code
			order by %s %s
			limit $%d offset $%d`,
			where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list BOMs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []Bom
		var total int64
		for rows.Next() {
			var row Bom
			var notes *string
			var components *string
			if err := rows.Scan(
				&row.ID, &row.BomCode, &row.BomName, &row.FinishedItemID,
				&row.FinishedItemCode, &row.FinishedItemName,
				&row.DefaultLocationID, &row.DefaultLocation,
				&row.OutputQty, &row.OutputUnitID, &row.OutputUnitCode,
				&row.YieldPct, &row.IsActive, &notes, &components, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read BOM.", "ERR_INTERNAL")
				return
			}
			row.Notes = notes
			if components != nil {
				row.Components = *components
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Bom{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getBom(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadBom(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "BOM not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createBom(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bomBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateBomBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create BOM.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		outputQty, yieldPct, outputUnitID, err := resolveBomHeaderDefaults(r.Context(), tx, tu.TenantID, body)
		if err != nil {
			response.Validation(w, map[string]string{"output_unit_id": err.Error()})
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.mfg_boms (
			  tenant_id, bom_code, bom_name, finished_item_id, default_location_id,
			  output_qty, output_unit_id, yield_pct, is_active, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			returning id`,
			tu.TenantID, strings.TrimSpace(body.BomCode), strings.TrimSpace(body.BomName),
			body.FinishedItemID, body.DefaultLocationID,
			outputQty, outputUnitID, yieldPct, body.IsActive == nil || *body.IsActive, body.Notes,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create BOM.", "ERR_INTERNAL")
			return
		}

		if err := replaceBomLines(r.Context(), tx, tu.TenantID, id, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save BOM.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.bom_create", "mfg_bom", &id, nil, body)
		row, _ := loadBom(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "BOM created.")
	}
}

func updateBom(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body bomBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateBomBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update BOM.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		outputQty, yieldPct, outputUnitID, err := resolveBomHeaderDefaults(r.Context(), tx, tu.TenantID, body)
		if err != nil {
			response.Validation(w, map[string]string{"output_unit_id": err.Error()})
			return
		}

		tag, err := tx.Exec(r.Context(), `
			update public.mfg_boms set
			  bom_code=$1, bom_name=$2, finished_item_id=$3, default_location_id=$4,
			  output_qty=$5, output_unit_id=$6, yield_pct=$7,
			  is_active=$8, notes=$9, updated_at=now()
			where id=$10 and tenant_id=$11`,
			strings.TrimSpace(body.BomCode), strings.TrimSpace(body.BomName), body.FinishedItemID,
			body.DefaultLocationID, outputQty, outputUnitID, yieldPct,
			body.IsActive == nil || *body.IsActive, body.Notes, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "BOM not found.", "ERR_NOT_FOUND")
			return
		}

		if err := replaceBomLines(r.Context(), tx, tu.TenantID, id, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save BOM.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.bom_update", "mfg_bom", &id, nil, body)
		row, _ := loadBom(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "BOM updated.")
	}
}

func deleteBom(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var inUse bool
		_ = pool.QueryRow(r.Context(), `
			select exists(select 1 from public.mfg_work_orders where bom_id=$1 and tenant_id=$2 and status in ('draft','released'))`,
			id, tu.TenantID).Scan(&inUse)
		if inUse {
			response.Validation(w, map[string]string{"bom": "BOM is referenced by open work orders."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.mfg_boms where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "BOM not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.bom_delete", "mfg_bom", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

type pgxpoolConn interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func loadBom(ctx context.Context, q pgxpoolConn, tenantID, id int64) (Bom, error) {
	var row Bom
	err := q.QueryRow(ctx, `
		select b.id, b.bom_code, b.bom_name, b.finished_item_id,
		  coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
		  b.default_location_id, coalesce(loc.location_name, ''),
		  b.output_qty::float8, b.output_unit_id, coalesce(ou.code, ''),
		  b.yield_pct::float8, b.is_active, b.notes
		from public.mfg_boms b
		join public.inv_items fi on fi.id = b.finished_item_id
		left join public.inv_locations loc on loc.id = b.default_location_id
		left join public.inv_units ou on ou.id = b.output_unit_id
		where b.id=$1 and b.tenant_id=$2`, id, tenantID).
		Scan(&row.ID, &row.BomCode, &row.BomName, &row.FinishedItemID,
			&row.FinishedItemCode, &row.FinishedItemName,
			&row.DefaultLocationID, &row.DefaultLocation,
			&row.OutputQty, &row.OutputUnitID, &row.OutputUnitCode,
			&row.YieldPct, &row.IsActive, &row.Notes)
	if err != nil {
		return Bom{}, err
	}
	lines, err := q.Query(ctx, `
		select l.id, l.line_no, l.component_item_id, coalesce(i.item_code, ''), coalesce(i.item_name, ''),
		  l.qty::float8, l.unit_id, coalesce(u.code, ''), coalesce(l.scrap_qty, 0)::float8,
		  coalesce(i.base_unit_id, 0), coalesce(bu.code, coalesce(nullif(trim(i.unit), ''), 'ea'))
		from public.mfg_bom_lines l
		left join public.inv_items i on i.id = l.component_item_id
		left join public.inv_units u on u.id = l.unit_id
		left join public.inv_units bu on bu.id = i.base_unit_id
		where l.bom_id=$1
		order by l.line_no`, id)
	if err != nil {
		return Bom{}, err
	}
	defer lines.Close()
	for lines.Next() {
		var ln BomLine
		if err := lines.Scan(
			&ln.ID, &ln.LineNo, &ln.ComponentItemID, &ln.ComponentCode, &ln.ComponentName,
			&ln.Qty, &ln.UnitID, &ln.UnitCode, &ln.ScrapQty, &ln.BaseUnitID, &ln.BaseUnitCode,
		); err != nil {
			return Bom{}, err
		}
		need := ln.Qty + ln.ScrapQty
		if ln.UnitID != nil && ln.BaseUnitID > 0 {
			if stock, err := inventory.ConvertQty(ctx, q, tenantID, *ln.UnitID, ln.BaseUnitID, need); err == nil {
				ln.StockQtyPreview = stock
			}
		} else if ln.BaseUnitID > 0 && (ln.UnitID == nil || *ln.UnitID == ln.BaseUnitID) {
			ln.StockQtyPreview = need
		}
		row.Lines = append(row.Lines, ln)
	}
	if row.Lines == nil {
		row.Lines = []BomLine{}
	}
	return row, nil
}

func resolveBomHeaderDefaults(ctx context.Context, q inventory.UnitQuerier, tenantID int64, body bomBody) (outputQty, yieldPct float64, outputUnitID *int64, err error) {
	outputQty = 1
	if body.OutputQty != nil && *body.OutputQty > 0 {
		outputQty = *body.OutputQty
	}
	yieldPct = 100
	if body.YieldPct != nil && *body.YieldPct > 0 {
		yieldPct = *body.YieldPct
	}
	outputUnitID = body.OutputUnitID
	if outputUnitID == nil || *outputUnitID <= 0 {
		var uid int64
		_ = q.QueryRow(ctx, `select coalesce(base_unit_id, 0) from public.inv_items where id=$1 and tenant_id=$2`,
			body.FinishedItemID, tenantID).Scan(&uid)
		if uid > 0 {
			outputUnitID = &uid
		} else {
			outputUnitID = nil
		}
	} else {
		var ok bool
		_ = q.QueryRow(ctx, `select exists(select 1 from public.inv_units where id=$1 and tenant_id=$2)`, *outputUnitID, tenantID).Scan(&ok)
		if !ok {
			return 0, 0, nil, fmt.Errorf("output unit must belong to this business")
		}
	}
	return outputQty, yieldPct, outputUnitID, nil
}

func validateBomBody(b bomBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(b.BomCode) == "" {
		errs["bom_code"] = "BOM code is required."
	}
	if strings.TrimSpace(b.BomName) == "" {
		errs["bom_name"] = "BOM name is required."
	}
	if b.FinishedItemID <= 0 {
		errs["finished_item_id"] = "Finished item is required."
	}
	if b.OutputQty != nil && *b.OutputQty <= 0 {
		errs["output_qty"] = "Output quantity must be greater than zero."
	}
	if b.YieldPct != nil && *b.YieldPct <= 0 {
		errs["yield_pct"] = "Yield % must be greater than zero."
	}
	if len(b.Lines) == 0 {
		errs["lines"] = "At least one component line is required."
	}
	for i, ln := range b.Lines {
		if ln.ComponentItemID <= 0 {
			errs[fmt.Sprintf("lines[%d].component_item_id", i)] = "Component item is required."
			continue
		}
		if ln.Qty <= 0 {
			errs[fmt.Sprintf("lines[%d].qty", i)] = "Used quantity must be greater than zero."
		}
		if ln.ScrapQty != nil && *ln.ScrapQty < 0 {
			errs[fmt.Sprintf("lines[%d].scrap_qty", i)] = "Scrap/spare quantity cannot be negative."
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func replaceBomLines(ctx context.Context, tx pgx.Tx, tenantID, bomID int64, lines []bomLineBody) error {
	if _, err := tx.Exec(ctx, `delete from public.mfg_bom_lines where bom_id=$1`, bomID); err != nil {
		return err
	}
	for i, ln := range lines {
		var baseUnitID int64
		var itemCode string
		err := tx.QueryRow(ctx, `
			select coalesce(base_unit_id, 0), coalesce(item_code, '')
			from public.inv_items where id=$1 and tenant_id=$2 and deleted_at is null`,
			ln.ComponentItemID, tenantID).Scan(&baseUnitID, &itemCode)
		if err != nil {
			return fmt.Errorf("component item %d not found", ln.ComponentItemID)
		}
		unitID := ln.UnitID
		if unitID == nil || *unitID <= 0 {
			if baseUnitID > 0 {
				unitID = &baseUnitID
			}
		} else {
			var ok bool
			_ = tx.QueryRow(ctx, `select exists(select 1 from public.inv_units where id=$1 and tenant_id=$2)`, *unitID, tenantID).Scan(&ok)
			if !ok {
				return fmt.Errorf("unit for component %s must belong to this business", itemCode)
			}
		}
		needQty := ln.Qty
		scrapQty := 0.0
		if ln.ScrapQty != nil {
			scrapQty = *ln.ScrapQty
		}
		needQty += scrapQty
		if unitID != nil && baseUnitID > 0 && *unitID != baseUnitID {
			if _, err := inventory.ConvertQty(ctx, tx, tenantID, *unitID, baseUnitID, needQty); err != nil {
				return fmt.Errorf("%s: %w", itemCode, err)
			}
		}
		if _, err := tx.Exec(ctx, `
			insert into public.mfg_bom_lines (bom_id, line_no, component_item_id, qty, unit_id, scrap_qty)
			values ($1,$2,$3,$4,$5,$6)`,
			bomID, i+1, ln.ComponentItemID, ln.Qty, unitID, scrapQty); err != nil {
			return err
		}
	}
	return nil
}

// StockIssueForLine computes stock qty to issue in component base UoM for a WO qty.
// Need per batch = used qty + scrap/spare qty (same line UoM), then scale by WO/output/yield.
func StockIssueForLine(ctx context.Context, q inventory.UnitQuerier, tenantID int64, line BomLine, woQty, outputQty, yieldPct float64) (float64, string, error) {
	if outputQty <= 0 {
		outputQty = 1
	}
	if yieldPct <= 0 {
		yieldPct = 100
	}
	fromUnit := int64(0)
	if line.UnitID != nil {
		fromUnit = *line.UnitID
	}
	toUnit := line.BaseUnitID
	if toUnit <= 0 {
		uid, code, err := inventory.ItemBaseUnit(ctx, q, tenantID, line.ComponentItemID)
		if err != nil {
			return 0, "", err
		}
		toUnit = uid
		line.BaseUnitCode = code
	}
	if fromUnit <= 0 {
		fromUnit = toUnit
	}
	if toUnit <= 0 {
		return 0, line.BaseUnitCode, fmt.Errorf("component %s has no base unit — set it on the item master", line.ComponentCode)
	}
	need := line.Qty + line.ScrapQty
	if need < 0 {
		need = 0
	}
	converted, err := inventory.ConvertQty(ctx, q, tenantID, fromUnit, toUnit, need)
	if err != nil {
		return 0, line.BaseUnitCode, err
	}
	eps := 1e-9
	yieldFactor := math.Max(yieldPct/100, eps)
	stock := converted * (woQty / outputQty) / yieldFactor
	return stock, line.BaseUnitCode, nil
}
