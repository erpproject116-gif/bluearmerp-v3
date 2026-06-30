package inventory

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type serialQtyMismatchRow struct {
	ContextType string  `json:"context_type"`
	ContextID   int64   `json:"context_id"`
	ParentID    int64   `json:"parent_id"`
	ItemID      *int64  `json:"item_id,omitempty"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name"`
	ExpectedQty float64 `json:"expected_qty"`
	SerialCount float64 `json:"serial_count"`
	GapQty      float64 `json:"gap_qty"`
}

type reservedStaleRow struct {
	ID           int64   `json:"id"`
	SerialNo     string  `json:"serial_no"`
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   *int64  `json:"location_id,omitempty"`
	LocationName string  `json:"location_name,omitempty"`
	ReservedAt   string  `json:"reserved_at"`
	DaysStale    int     `json:"days_stale"`
	ReleaseLineID *int64 `json:"sales_order_release_line_id,omitempty"`
}

type soReleaseGapRow struct {
	SalesOrderID     int64   `json:"sales_order_id"`
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	SalesOrderNo     string  `json:"sales_order_no"`
	CustomerName     string  `json:"customer_name"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	OrderQty         float64 `json:"order_qty"`
	ReleasedQty      float64 `json:"released_qty"`
	GapQty           float64 `json:"gap_qty"`
}

type grSerialGapRow struct {
	GoodsReceiptID     int64   `json:"goods_receipt_id"`
	GoodsReceiptLineID int64   `json:"goods_receipt_line_id"`
	LineNo             int     `json:"line_no"`
	ItemCode           string  `json:"item_code"`
	ItemName           string  `json:"item_name"`
	ExpectedQty        float64 `json:"expected_qty"`
	ReceivedQty        float64 `json:"received_qty"`
	SerialCount        float64 `json:"serial_count"`
	GapQty             float64 `json:"gap_qty"`
}

func registerReconciliationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/reconciliation/serial-qty", listSerialQtyMismatch(pool))
	r.Get("/reconciliation/reserved-stale", listReservedStale(pool))
	r.Get("/reconciliation/so-release-gap", listSOReleaseGap(pool))
	r.Get("/reconciliation/gr-serial-gap", listGRSerialGap(pool))
	r.Get("/reconciliation/reserve-without-dr", listReserveWithoutDR(pool))
	r.Get("/reconciliation/dr-without-invoice", listDRWithoutInvoice(pool))
	r.Get("/reconciliation/gr-without-supplier-invoice", listGRWithoutSupplierInvoice(pool))
	r.Get("/reconciliation/ap-over-application", listAPOverApplication(pool))
}

func listSerialQtyMismatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "item_code", map[string]string{
			"item_code": "item_code",
			"gap_qty":   "gap_qty",
		})
		offset := httputil.Offset(p)

		rows, err := pool.Query(r.Context(), `
			select context_type, context_id, parent_id, item_id, item_code, item_name,
			  expected_qty::float8, serial_cnt::float8,
			  (expected_qty - serial_cnt)::float8,
			  count(*) over()
			from (
			  select 'sales_line' as context_type, ln.id as context_id, s.id as parent_id,
			    ln.item_id, ln.item_code, ln.item_name, ln.qty as expected_qty,
			    coalesce(j.serial_cnt, 0) as serial_cnt
			  from public.sa_sales_lines ln
			  join public.sa_sales s on s.id = ln.sales_id
			  join public.inv_items i on i.id = ln.item_id
			  left join (
			    select sales_line_id, count(*)::numeric as serial_cnt
			    from public.inv_serial_unit_sales_lines
			    group by sales_line_id
			  ) j on j.sales_line_id = ln.id
			  where s.tenant_id = $1 and s.deleted_at is null
			    and i.track_serial = true and ln.qty > 0
			    and coalesce(j.serial_cnt, 0) <> ln.qty
			  union all
			  select 'release_line', rl.id, so.id,
			    ln.item_id, ln.item_code, ln.item_name, rl.release_qty,
			    coalesce(su.serial_cnt, 0)
			  from public.so_sales_order_release_lines rl
			  join public.so_sales_order_lines ln on ln.id = rl.sales_order_line_id
			  join public.so_sales_orders so on so.id = ln.sales_order_id
			  join public.inv_items i on i.id = ln.item_id
			  left join (
			    select sales_order_release_line_id, count(*)::numeric as serial_cnt
			    from public.inv_serial_units
			    where sales_order_release_line_id is not null
			    group by sales_order_release_line_id
			  ) su on su.sales_order_release_line_id = rl.id
			  where so.tenant_id = $1 and so.deleted_at is null
			    and i.track_serial = true and rl.release_qty > 0
			    and coalesce(su.serial_cnt, 0) <> rl.release_qty
			) mismatches
			order by abs(expected_qty - serial_cnt) desc, item_code asc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load serial quantity mismatches.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []serialQtyMismatchRow
		var total int64
		for rows.Next() {
			var row serialQtyMismatchRow
			if err := rows.Scan(
				&row.ContextType, &row.ContextID, &row.ParentID, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.ExpectedQty, &row.SerialCount, &row.GapQty, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read serial quantity mismatches.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []serialQtyMismatchRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listReservedStale(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		days := 30
		if d := strings.TrimSpace(r.URL.Query().Get("days")); d != "" {
			if n, err := strconv.Atoi(d); err == nil && n > 0 {
				days = n
			}
		}
		p := httputil.ParseListParams(r, "reserved_at", map[string]string{
			"reserved_at": "su.reserved_at",
			"serial_no":   "su.serial_no",
			"days_stale":  "days_stale",
		})
		offset := httputil.Offset(p)

		rows, err := pool.Query(r.Context(), `
			select su.id, su.serial_no, su.item_id, i.item_code, i.item_name,
			  su.location_id, coalesce(loc.location_name, ''),
			  su.reserved_at,
			  (extract(epoch from (now() - su.reserved_at)) / 86400)::int,
			  su.sales_order_release_line_id,
			  count(*) over()
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations loc on loc.id = su.location_id
			where su.tenant_id = $1 and su.status = 'reserved'
			  and su.reserved_at is not null
			  and su.reserved_at < (now() - make_interval(days => $2))
			order by su.reserved_at asc
			limit $3 offset $4`, tu.TenantID, days, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load stale reserved serials.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []reservedStaleRow
		var total int64
		for rows.Next() {
			var row reservedStaleRow
			var reservedAt time.Time
			if err := rows.Scan(
				&row.ID, &row.SerialNo, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.LocationID, &row.LocationName,
				&reservedAt, &row.DaysStale, &row.ReleaseLineID, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read stale reserved serials.", "ERR_INTERNAL")
				return
			}
			row.ReservedAt = reservedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []reservedStaleRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listSOReleaseGap(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "sales_order_no", map[string]string{
			"sales_order_no": "so.sales_order_no",
			"gap_qty":        "gap_qty",
		})
		offset := httputil.Offset(p)

		rows, err := pool.Query(r.Context(), `
			select so.id, ln.id, so.sales_order_no, p.company_name,
			  ln.item_code, ln.item_name,
			  ln.qty::float8,
			  coalesce(rel.released, 0)::float8,
			  (ln.qty - coalesce(rel.released, 0))::float8,
			  count(*) over()
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			join public.inv_partners p on p.id = so.partner_id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			where so.tenant_id = $1 and so.deleted_at is null
			  and so.progress_status not in ('cancelled', 'completed')
			  and (ln.qty - coalesce(rel.released, 0)) > 0.0001
			order by (ln.qty - coalesce(rel.released, 0)) desc, so.order_date desc, ln.line_no asc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales order release gaps.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []soReleaseGapRow
		var total int64
		for rows.Next() {
			var row soReleaseGapRow
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &row.SalesOrderNo, &row.CustomerName,
				&row.ItemCode, &row.ItemName,
				&row.OrderQty, &row.ReleasedQty, &row.GapQty, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales order release gaps.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []soReleaseGapRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listGRSerialGap(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := `gr.tenant_id = $1 and gr.status = 'draft' and coalesce(i.track_serial, false) = true`
		args := []any{tu.TenantID}
		argN := 2
		if grIDStr := strings.TrimSpace(r.URL.Query().Get("goods_receipt_id")); grIDStr != "" {
			grID, err := strconv.ParseInt(grIDStr, 10, 64)
			if err != nil || grID <= 0 {
				response.Validation(w, map[string]string{"goods_receipt_id": "Invalid goods receipt id."})
				return
			}
			where += fmt.Sprintf(" and gr.id = $%d", argN)
			args = append(args, grID)
		}

		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select gr.id, grl.id, grl.line_no, pol.item_code, pol.item_name,
			  grl.expected_qty::float8, grl.received_qty::float8,
			  coalesce(sc.cnt, 0)::float8,
			  (grl.received_qty - coalesce(sc.cnt, 0))::float8
			from public.gr_goods_receipt_lines grl
			join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			left join public.inv_items i on i.id = pol.item_id
			left join (
			  select goods_receipt_line_id, count(*)::numeric as cnt
			  from public.gr_goods_receipt_serials
			  group by goods_receipt_line_id
			) sc on sc.goods_receipt_line_id = grl.id
			where %s
			  and abs(grl.received_qty - coalesce(sc.cnt, 0)) > 0.0001
			order by gr.id desc, grl.line_no asc`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load goods receipt serial gaps.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []grSerialGapRow
		for rows.Next() {
			var row grSerialGapRow
			if err := rows.Scan(
				&row.GoodsReceiptID, &row.GoodsReceiptLineID, &row.LineNo,
				&row.ItemCode, &row.ItemName,
				&row.ExpectedQty, &row.ReceivedQty, &row.SerialCount, &row.GapQty,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read goods receipt serial gaps.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []grSerialGapRow{}
		}
		response.OK(w, out, "OK")
	}
}

type reserveWithoutDRRow struct {
	SalesOrderID     int64   `json:"sales_order_id"`
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	SalesOrderNo     string  `json:"sales_order_no"`
	CustomerName     string  `json:"customer_name"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	ReleasedQty      float64 `json:"released_qty"`
	DeliveredQty     float64 `json:"delivered_qty"`
	GapQty           float64 `json:"gap_qty"`
}

type drWithoutInvoiceRow struct {
	SalesOrderID     int64   `json:"sales_order_id"`
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	SalesOrderNo     string  `json:"sales_order_no"`
	CustomerName     string  `json:"customer_name"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	DeliveredQty     float64 `json:"delivered_qty"`
	InvoicedQty      float64 `json:"invoiced_qty"`
	GapQty           float64 `json:"gap_qty"`
}

type grWithoutSupplierInvoiceRow struct {
	GoodsReceiptID     int64   `json:"goods_receipt_id"`
	GoodsReceiptLineID int64   `json:"goods_receipt_line_id"`
	PurchaseOrderNo    string  `json:"purchase_order_no"`
	VendorName         string  `json:"vendor_name"`
	ItemCode           string  `json:"item_code"`
	ItemName           string  `json:"item_name"`
	ReceivedQty        float64 `json:"received_qty"`
	BilledQty          float64 `json:"billed_qty"`
	GapQty             float64 `json:"gap_qty"`
}

type apOverApplicationRow struct {
	SupplierInvoiceID int64   `json:"supplier_invoice_id"`
	InvoiceNo         string  `json:"invoice_no"`
	VendorName        string  `json:"vendor_name"`
	GrandTotal        float64 `json:"grand_total"`
	AppliedAmount     float64 `json:"applied_amount"`
	OverAmount        float64 `json:"over_amount"`
}

func listReserveWithoutDR(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "sales_order_no", map[string]string{
			"sales_order_no": "so.sales_order_no",
			"gap_qty":        "gap_qty",
		})
		offset := httputil.Offset(p)

		rows, err := pool.Query(r.Context(), `
			select so.id, ln.id, so.sales_order_no, p.company_name,
			  ln.item_code, ln.item_name,
			  coalesce(rel.released, 0)::float8,
			  coalesce(dr.delivered, 0)::float8,
			  (coalesce(rel.released, 0) - coalesce(dr.delivered, 0))::float8,
			  count(*) over()
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			join public.inv_partners p on p.id = so.partner_id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as delivered
			  from public.so_sales_order_slip_lines
			  where slip_type = 'delivery_receipt'
			  group by sales_order_line_id
			) dr on dr.sales_order_line_id = ln.id
			where so.tenant_id = $1 and so.deleted_at is null
			  and coalesce(rel.released, 0) > 0.0001
			  and (coalesce(rel.released, 0) - coalesce(dr.delivered, 0)) > 0.0001
			order by (coalesce(rel.released, 0) - coalesce(dr.delivered, 0)) desc, so.order_date desc, ln.line_no asc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load reserve-without-DR rows.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []reserveWithoutDRRow
		var total int64
		for rows.Next() {
			var row reserveWithoutDRRow
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &row.SalesOrderNo, &row.CustomerName,
				&row.ItemCode, &row.ItemName,
				&row.ReleasedQty, &row.DeliveredQty, &row.GapQty, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read reserve-without-DR rows.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []reserveWithoutDRRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listDRWithoutInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "sales_order_no", map[string]string{
			"sales_order_no": "so.sales_order_no",
			"gap_qty":        "gap_qty",
		})
		offset := httputil.Offset(p)

		rows, err := pool.Query(r.Context(), `
			select so.id, ln.id, so.sales_order_no, p.company_name,
			  ln.item_code, ln.item_name,
			  coalesce(dr.delivered, 0)::float8,
			  coalesce(slip.sold, 0)::float8,
			  (coalesce(dr.delivered, 0) - coalesce(slip.sold, 0))::float8,
			  count(*) over()
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			join public.inv_partners p on p.id = so.partner_id
			left join (
			  select sales_order_line_id, sum(qty) as delivered
			  from public.so_sales_order_slip_lines
			  where slip_type = 'delivery_receipt'
			  group by sales_order_line_id
			) dr on dr.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as sold
			  from public.so_sales_order_slip_lines
			  where slip_type = 'sales'
			  group by sales_order_line_id
			) slip on slip.sales_order_line_id = ln.id
			where so.tenant_id = $1 and so.deleted_at is null
			  and coalesce(dr.delivered, 0) > 0.0001
			  and (coalesce(dr.delivered, 0) - coalesce(slip.sold, 0)) > 0.0001
			order by (coalesce(dr.delivered, 0) - coalesce(slip.sold, 0)) desc, so.order_date desc, ln.line_no asc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load DR-without-invoice rows.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []drWithoutInvoiceRow
		var total int64
		for rows.Next() {
			var row drWithoutInvoiceRow
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &row.SalesOrderNo, &row.CustomerName,
				&row.ItemCode, &row.ItemName,
				&row.DeliveredQty, &row.InvoicedQty, &row.GapQty, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read DR-without-invoice rows.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []drWithoutInvoiceRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listGRWithoutSupplierInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "purchase_order_no", map[string]string{
			"purchase_order_no": "po.purchase_order_no",
			"gap_qty":           "gap_qty",
		})
		offset := httputil.Offset(p)

		rows, err := pool.Query(r.Context(), `
			select gr.id, grl.id, po.purchase_order_no, p.company_name,
			  pol.item_code, pol.item_name,
			  grl.received_qty::float8,
			  coalesce(sl.billed, 0)::float8,
			  (grl.received_qty - coalesce(sl.billed, 0))::float8,
			  count(*) over()
			from public.gr_goods_receipt_lines grl
			join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			join public.po_purchase_orders po on po.id = pol.purchase_order_id
			join public.inv_partners p on p.id = po.partner_id
			left join (
			  select goods_receipt_line_id, sum(qty) as billed
			  from public.gr_goods_receipt_slip_lines
			  where slip_type = 'supplier_invoice'
			  group by goods_receipt_line_id
			) sl on sl.goods_receipt_line_id = grl.id
			where gr.tenant_id = $1 and gr.status = 'posted'
			  and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001
			order by (grl.received_qty - coalesce(sl.billed, 0)) desc, gr.receipt_date desc, grl.line_no asc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load GR-without-supplier-invoice rows.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []grWithoutSupplierInvoiceRow
		var total int64
		for rows.Next() {
			var row grWithoutSupplierInvoiceRow
			if err := rows.Scan(
				&row.GoodsReceiptID, &row.GoodsReceiptLineID, &row.PurchaseOrderNo, &row.VendorName,
				&row.ItemCode, &row.ItemName,
				&row.ReceivedQty, &row.BilledQty, &row.GapQty, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read GR-without-supplier-invoice rows.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []grWithoutSupplierInvoiceRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listAPOverApplication(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "invoice_no", map[string]string{
			"invoice_no":  "si.invoice_no",
			"over_amount": "over_amount",
		})
		offset := httputil.Offset(p)

		rows, err := pool.Query(r.Context(), `
			select si.id, si.invoice_no, p.company_name,
			  si.grand_total::float8,
			  coalesce(paid.applied, 0)::float8,
			  (coalesce(paid.applied, 0) - si.grand_total)::float8,
			  count(*) over()
			from public.fin_supplier_invoices si
			join public.inv_partners p on p.id = si.partner_id
			left join (
			  select supplier_invoice_id, sum(applied_amount) as applied
			  from public.fin_payment_applications
			  group by supplier_invoice_id
			) paid on paid.supplier_invoice_id = si.id
			where si.tenant_id = $1 and si.deleted_at is null
			  and coalesce(paid.applied, 0) > si.grand_total + 0.0001
			order by (coalesce(paid.applied, 0) - si.grand_total) desc, si.invoice_date desc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load AP over-application rows.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []apOverApplicationRow
		var total int64
		for rows.Next() {
			var row apOverApplicationRow
			if err := rows.Scan(
				&row.SupplierInvoiceID, &row.InvoiceNo, &row.VendorName,
				&row.GrandTotal, &row.AppliedAmount, &row.OverAmount, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read AP over-application rows.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []apOverApplicationRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
