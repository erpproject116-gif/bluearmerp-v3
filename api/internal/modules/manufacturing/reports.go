package manufacturing

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type woStatusReportRow struct {
	WorkOrderID       int64   `json:"work_order_id"`
	WorkOrderNo       string  `json:"work_order_no"`
	OrderDate         string  `json:"order_date"`
	Status            string  `json:"status"`
	InspectionStatus  string  `json:"inspection_status"`
	BomCode           string  `json:"bom_code"`
	BomName           string  `json:"bom_name"`
	BomType           string  `json:"bom_type"`
	FinishedItemCode  string  `json:"finished_item_code"`
	FinishedItemName  string  `json:"finished_item_name"`
	LocationName      string  `json:"location_name"`
	QtyToProduce      float64 `json:"qty_to_produce"`
	QtyProduced       float64 `json:"qty_produced"`
	SourceSalesOrderNo *string `json:"source_sales_order_no,omitempty"`
	ReleasedAt        *string `json:"released_at,omitempty"`
	CompletedAt       *string `json:"completed_at,omitempty"`
}

type woProgressReportRow struct {
	WorkOrderID        int64   `json:"work_order_id"`
	WorkOrderNo        string  `json:"work_order_no"`
	Status             string  `json:"status"`
	BomCode            string  `json:"bom_code"`
	QtyToProduce       float64 `json:"qty_to_produce"`
	QtyProduced        float64 `json:"qty_produced"`
	ProgressPct        float64 `json:"progress_pct"`
	IssuedSerials      int     `json:"issued_serials"`
	IssuedLotQty       float64 `json:"issued_lot_qty"`
	OutputSerials      int     `json:"output_serials"`
	OutputLotQty       float64 `json:"output_lot_qty"`
	InspectionStatus   string  `json:"inspection_status"`
	SourceSalesOrderNo *string `json:"source_sales_order_no,omitempty"`
}

type woStockMovementRow struct {
	ID                 int64   `json:"id"`
	WorkOrderID        int64   `json:"work_order_id"`
	WorkOrderNo        string  `json:"work_order_no"`
	ItemCode           string  `json:"item_code"`
	ItemName           string  `json:"item_name"`
	LocationName       string  `json:"location_name"`
	QtyDelta           float64 `json:"qty_delta"`
	MovementType       string  `json:"movement_type"`
	CreatedAt          string  `json:"created_at"`
	SourceSalesOrderNo *string `json:"source_sales_order_no,omitempty"`
}

func listWorkOrderStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		filters, errs := parseWoReportDateRange(r)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":      "wo.order_date",
			"work_order_no":   "wo.work_order_no",
			"status":          "wo.status",
			"finished_item":   "fi.item_code",
		})
		offset := httputil.Offset(p)

		where := "wo.tenant_id = $1 and wo.order_date >= $2::date and wo.order_date <= $3::date"
		args := []any{tu.TenantID, filters.DateFrom.Format("2006-01-02"), filters.DateTo.Format("2006-01-02")}
		argN := 4
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and wo.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok && id != nil && *id > 0 {
			where += fmt.Sprintf(" and wo.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if bt := parseBomTypeListFilter(r.URL.Query().Get("bom_type")); bt != "" {
			where += fmt.Sprintf(" and coalesce(b.bom_type, 'assembly') = $%d", argN)
			args = append(args, bt)
			argN++
		}

		q := fmt.Sprintf(`
			select wo.id, wo.work_order_no, wo.order_date::text, wo.status, wo.inspection_status,
			  b.bom_code, b.bom_name, coalesce(b.bom_type, 'assembly'),
			  coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
			  coalesce(loc.location_name, ''),
			  wo.qty_to_produce::float8, wo.qty_produced::float8,
			  so.sales_order_no, wo.released_at::text, wo.completed_at::text,
			  count(*) over()
			from public.mfg_work_orders wo
			join public.mfg_boms b on b.id = wo.bom_id
			join public.inv_items fi on fi.id = wo.finished_item_id
			left join public.inv_locations loc on loc.id = wo.location_id
			left join public.so_sales_orders so on so.id = wo.source_sales_order_id
			where %s
			order by wo.order_date desc, wo.id desc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list work order status.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []woStatusReportRow{}
		var total int64
		for rows.Next() {
			var row woStatusReportRow
			var soNo *string
			var released, completed *string
			if err := rows.Scan(
				&row.WorkOrderID, &row.WorkOrderNo, &row.OrderDate, &row.Status, &row.InspectionStatus,
				&row.BomCode, &row.BomName, &row.BomType, &row.FinishedItemCode, &row.FinishedItemName, &row.LocationName,
				&row.QtyToProduce, &row.QtyProduced, &soNo, &released, &completed, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read work order status.", "ERR_INTERNAL")
				return
			}
			row.SourceSalesOrderNo = soNo
			row.ReleasedAt = released
			row.CompletedAt = completed
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listWorkOrderProgressReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		filters, errs := parseWoReportDateRange(r)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":    "wo.order_date",
			"work_order_no": "wo.work_order_no",
			"progress_pct":  "progress_pct",
		})
		offset := httputil.Offset(p)

		where := "wo.tenant_id = $1 and wo.order_date >= $2::date and wo.order_date <= $3::date"
		args := []any{tu.TenantID, filters.DateFrom.Format("2006-01-02"), filters.DateTo.Format("2006-01-02")}
		argN := 4
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and wo.status = $%d", argN)
			args = append(args, st)
			argN++
		}

		q := fmt.Sprintf(`
			select wo.id, wo.work_order_no, wo.status, coalesce(b.bom_code, ''),
			  wo.qty_to_produce::float8, wo.qty_produced::float8,
			  case when wo.qty_to_produce > 0 then round((wo.qty_produced / wo.qty_to_produce) * 100, 2) else 0 end,
			  coalesce(iss_s.serial_cnt, 0), coalesce(iss_l.lot_qty, 0),
			  coalesce(out_s.cnt, 0), coalesce(out_l.qty, 0),
			  wo.inspection_status, so.sales_order_no,
			  count(*) over()
			from public.mfg_work_orders wo
			join public.mfg_boms b on b.id = wo.bom_id
			left join public.so_sales_orders so on so.id = wo.source_sales_order_id
			left join (
			  select work_order_id, count(*)::int as serial_cnt
			  from public.mfg_wo_issue_serials
			  group by work_order_id
			) iss_s on iss_s.work_order_id = wo.id
			left join (
			  select work_order_id, coalesce(sum(qty), 0)::float8 as lot_qty
			  from public.mfg_wo_issue_lots
			  group by work_order_id
			) iss_l on iss_l.work_order_id = wo.id
			left join (
			  select work_order_id, count(*)::int as cnt
			  from public.mfg_wo_output_serials where status = 'staged'
			  group by work_order_id
			) out_s on out_s.work_order_id = wo.id
			left join (
			  select work_order_id, coalesce(sum(qty), 0)::float8 as qty
			  from public.mfg_wo_output_lots where status = 'staged'
			  group by work_order_id
			) out_l on out_l.work_order_id = wo.id
			where %s
			order by wo.order_date desc, wo.id desc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list work order progress.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []woProgressReportRow{}
		var total int64
		for rows.Next() {
			var row woProgressReportRow
			var soNo *string
			if err := rows.Scan(
				&row.WorkOrderID, &row.WorkOrderNo, &row.Status, &row.BomCode,
				&row.QtyToProduce, &row.QtyProduced, &row.ProgressPct,
				&row.IssuedSerials, &row.IssuedLotQty,
				&row.OutputSerials, &row.OutputLotQty,
				&row.InspectionStatus, &soNo, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read work order progress.", "ERR_INTERNAL")
				return
			}
			row.SourceSalesOrderNo = soNo
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listWorkOrderStockMovementsReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		filters, errs := parseWoReportDateRange(r)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "created_at", map[string]string{
			"created_at":    "sm.created_at",
			"item_code":     "i.item_code",
			"movement_type": "sm.movement_type",
		})
		offset := httputil.Offset(p)

		where := `sm.tenant_id = $1 and sm.ref_type = 'mfg_work_order'
			and sm.created_at >= $2::timestamptz
			and sm.created_at < ($3::date + interval '1 day')`
		args := []any{tu.TenantID, filters.DateFrom.Format("2006-01-02") + " 00:00:00+00", filters.DateTo.Format("2006-01-02")}
		argN := 4
		if id, ok := optionalInt64Query(r, "work_order_id"); ok && id != nil && *id > 0 {
			where += fmt.Sprintf(" and sm.ref_id = $%d", argN)
			args = append(args, *id)
			argN++
		}

		q := fmt.Sprintf(`
			select sm.id, wo.id, wo.work_order_no,
			  coalesce(i.item_code, ''), coalesce(i.item_name, ''),
			  coalesce(loc.location_name, ''),
			  sm.qty_delta::float8, sm.movement_type, sm.created_at::text,
			  so.sales_order_no,
			  count(*) over()
			from public.inv_stock_movements sm
			join public.mfg_work_orders wo on wo.id = sm.ref_id and wo.tenant_id = sm.tenant_id
			join public.inv_items i on i.id = sm.item_id
			left join public.inv_locations loc on loc.id = sm.location_id
			left join public.so_sales_orders so on so.id = wo.source_sales_order_id
			where %s
			order by sm.created_at desc, sm.id desc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list stock movements.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []woStockMovementRow{}
		var total int64
		for rows.Next() {
			var row woStockMovementRow
			var soNo *string
			if err := rows.Scan(
				&row.ID, &row.WorkOrderID, &row.WorkOrderNo,
				&row.ItemCode, &row.ItemName, &row.LocationName,
				&row.QtyDelta, &row.MovementType, &row.CreatedAt, &soNo, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read stock movements.", "ERR_INTERNAL")
				return
			}
			row.SourceSalesOrderNo = soNo
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

type woReportDateRange struct {
	DateFrom time.Time
	DateTo   time.Time
}

func parseWoReportDateRange(r *http.Request) (woReportDateRange, map[string]string) {
	errs := map[string]string{}
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	if fromStr == "" {
		errs["date_from"] = "Start date is required."
	}
	if toStr == "" {
		errs["date_to"] = "End date is required."
	}
	if len(errs) > 0 {
		return woReportDateRange{}, errs
	}
	from, err := parseDate(fromStr)
	if err != nil {
		errs["date_from"] = "Invalid date. Use YYYY-MM-DD."
	}
	to, err := parseDate(toStr)
	if err != nil {
		errs["date_to"] = "Invalid date. Use YYYY-MM-DD."
	}
	if len(errs) > 0 {
		return woReportDateRange{}, errs
	}
	if to.Before(from) {
		errs["date_to"] = "End date must be on or after start date."
	}
	return woReportDateRange{DateFrom: from, DateTo: to}, errs
}

type disassemblyYieldRow struct {
	WorkOrderID      int64   `json:"work_order_id"`
	WorkOrderNo      string  `json:"work_order_no"`
	BomCode          string  `json:"bom_code"`
	ComponentCode    string  `json:"component_code"`
	ComponentName    string  `json:"component_name"`
	Classification   string  `json:"output_classification,omitempty"`
	PlannedQty       float64 `json:"planned_qty"`
	ActualQty        float64 `json:"actual_qty"`
	VarianceQty      float64 `json:"variance_qty"`
	ActualInputQty   float64 `json:"actual_input_qty"`
	QtyToProduce     float64 `json:"qty_to_produce"`
	YieldPct         float64 `json:"yield_pct,omitempty"`
	ExpectedMinPct   *float64 `json:"expected_yield_pct_min,omitempty"`
	ExpectedMaxPct   *float64 `json:"expected_yield_pct_max,omitempty"`
	BandStatus       string  `json:"band_status,omitempty"` // in_band | below_min | above_max | n/a
}

func listDisassemblyYieldReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		filters, verr := parseWoReportDateRange(r)
		if len(verr) > 0 {
			response.Validation(w, verr)
			return
		}
		p := httputil.ParseListParams(r, "work_order_no", map[string]string{"work_order_no": "wo.work_order_no"})
		offset := httputil.Offset(p)

		q := `
			select wo.id, wo.work_order_no, b.bom_code,
			  coalesce(ci.item_code, ''), coalesce(ci.item_name, ''),
			  coalesce(nullif(trim(bl.output_classification), ''), 'finished'),
			  (bl.qty * (coalesce(wo.actual_input_qty, wo.qty_to_produce) / nullif(b.output_qty, 0))
			    / greatest(coalesce(b.yield_pct, 100) / 100.0, 0.0001))::float8 as planned_qty,
			  coalesce((
			    select sum(m.qty_delta)::float8 from public.inv_stock_movements m
			    where m.tenant_id = wo.tenant_id and m.ref_type = 'mfg_work_order' and m.ref_id = wo.id
			      and m.item_id = bl.component_item_id and m.movement_type = 'wo_disassembly_receipt'
			  ), 0)::float8 as actual_qty,
			  coalesce(wo.actual_input_qty, wo.qty_to_produce)::float8,
			  wo.qty_to_produce::float8,
			  coalesce(b.yield_pct, 100)::float8,
			  b.expected_yield_pct_min::float8, b.expected_yield_pct_max::float8,
			  count(*) over()
			from public.mfg_work_orders wo
			join public.mfg_boms b on b.id = wo.bom_id and coalesce(b.bom_type, 'assembly') = 'disassembly'
			join public.mfg_bom_lines bl on bl.bom_id = b.id
			join public.inv_items ci on ci.id = bl.component_item_id
			where wo.tenant_id = $1
			  and wo.order_date >= $2::date and wo.order_date <= $3::date
			  and wo.status = 'completed'
			order by wo.work_order_no, bl.line_no
			limit $4 offset $5`
		rows, err := pool.Query(r.Context(), q, tu.TenantID, filters.DateFrom.Format("2006-01-02"), filters.DateTo.Format("2006-01-02"), p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load yield report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []disassemblyYieldRow
		var total int64
		for rows.Next() {
			var row disassemblyYieldRow
			if err := rows.Scan(
				&row.WorkOrderID, &row.WorkOrderNo, &row.BomCode,
				&row.ComponentCode, &row.ComponentName, &row.Classification,
				&row.PlannedQty, &row.ActualQty,
				&row.ActualInputQty, &row.QtyToProduce, &row.YieldPct,
				&row.ExpectedMinPct, &row.ExpectedMaxPct, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read yield report.", "ERR_INTERNAL")
				return
			}
			row.VarianceQty = row.ActualQty - row.PlannedQty
			row.BandStatus = yieldBandStatus(row.ActualQty, row.PlannedQty, row.ExpectedMinPct, row.ExpectedMaxPct)
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func yieldBandStatus(actual, planned float64, minPct, maxPct *float64) string {
	if planned <= 0.0001 {
		return "n/a"
	}
	pct := (actual / planned) * 100
	if minPct == nil && maxPct == nil {
		return "n/a"
	}
	if minPct != nil && pct+0.0001 < *minPct {
		return "below_min"
	}
	if maxPct != nil && pct-0.0001 > *maxPct {
		return "above_max"
	}
	return "in_band"
}

type wasteVarianceRow struct {
	WorkOrderID     int64   `json:"work_order_id"`
	WorkOrderNo     string  `json:"work_order_no"`
	BomCode         string  `json:"bom_code"`
	ComponentCode   string  `json:"component_code,omitempty"`
	ComponentName   string  `json:"component_name,omitempty"`
	Classification  string  `json:"classification"`
	ExpectedQty     float64 `json:"expected_qty"`
	ActualQty       float64 `json:"actual_qty"`
	ExcessQty       float64 `json:"excess_qty"`
	WasteReasonCode string  `json:"waste_reason_code,omitempty"`
	WasteReasonName string  `json:"waste_reason_name,omitempty"`
	IsAbnormal      bool    `json:"is_abnormal"`
	Notes           string  `json:"notes,omitempty"`
	OrderDate       string  `json:"order_date"`
}

func listWasteVarianceReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		filters, verr := parseWoReportDateRange(r)
		if len(verr) > 0 {
			response.Validation(w, verr)
			return
		}
		p := httputil.ParseListParams(r, "work_order_no", map[string]string{"work_order_no": "wo.work_order_no"})
		offset := httputil.Offset(p)
		q := `
			select wo.id, wo.work_order_no, coalesce(b.bom_code, ''),
			  coalesce(ci.item_code, ''), coalesce(ci.item_name, ''),
			  wl.classification,
			  wl.expected_qty::float8, wl.qty::float8,
			  coalesce(wr.code, ''), coalesce(wr.name, ''), coalesce(wr.is_abnormal, false),
			  coalesce(wl.notes, ''), wo.order_date::text,
			  count(*) over()
			from public.mfg_wo_waste_lines wl
			join public.mfg_work_orders wo on wo.id = wl.work_order_id and wo.tenant_id = wl.tenant_id
			left join public.mfg_boms b on b.id = wo.bom_id
			left join public.inv_items ci on ci.id = wl.component_item_id
			left join public.mfg_waste_reasons wr on wr.id = wl.waste_reason_id
			where wl.tenant_id = $1
			  and wo.order_date >= $2::date and wo.order_date <= $3::date
			order by wo.order_date desc, wo.work_order_no, wl.id
			limit $4 offset $5`
		rows, err := pool.Query(r.Context(), q, tu.TenantID, filters.DateFrom.Format("2006-01-02"), filters.DateTo.Format("2006-01-02"), p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load waste report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []wasteVarianceRow
		var total int64
		for rows.Next() {
			var row wasteVarianceRow
			if err := rows.Scan(
				&row.WorkOrderID, &row.WorkOrderNo, &row.BomCode,
				&row.ComponentCode, &row.ComponentName, &row.Classification,
				&row.ExpectedQty, &row.ActualQty,
				&row.WasteReasonCode, &row.WasteReasonName, &row.IsAbnormal,
				&row.Notes, &row.OrderDate, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read waste report.", "ERR_INTERNAL")
				return
			}
			row.ExcessQty = ExcessWasteQty(row.ExpectedQty, row.ActualQty)
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
