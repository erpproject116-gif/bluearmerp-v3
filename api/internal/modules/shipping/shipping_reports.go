package shipping

import (
	"context"
	"encoding/csv"
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

const shippingReportExportMaxRows = 5000

type shippingDateFilters struct {
	DateFrom time.Time
	DateTo   time.Time
}

type shippingStatusFilters struct {
	shippingDateFilters
	LocationID  *int64
	PartnerID   *int64
	ItemID      *int64
	Status      string
	SalesOrderID *int64
}

type shipmentStatusRow struct {
	ShippingOrderID int64   `json:"shipping_order_id"`
	LineID          int64   `json:"line_id"`
	ShippingDate    string  `json:"shipping_date"`
	ShippingNo      string  `json:"shipping_no"`
	Status          string  `json:"status"`
	CustomerName    string  `json:"customer_name"`
	LocationName    string  `json:"location_name"`
	SalesOrderNo    string  `json:"sales_order_no"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Qty             float64 `json:"qty"`
	Carrier         string  `json:"carrier,omitempty"`
}

type pendingShipmentRow struct {
	SalesOrderID   int64   `json:"sales_order_id"`
	LineID         int64   `json:"line_id"`
	SalesOrderNo   string  `json:"sales_order_no"`
	CustomerName   string  `json:"customer_name"`
	LocationName   string  `json:"location_name"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	OrderQty       float64 `json:"order_qty"`
	ShippedQty     float64 `json:"shipped_qty"`
	PendingQty     float64 `json:"pending_qty"`
	DeliveryDate   *string `json:"delivery_date,omitempty"`
}

type shippingOrderStatusRow struct {
	ShippingOrderID int64   `json:"shipping_order_id"`
	LineID          int64   `json:"line_id"`
	ShippingDate    string  `json:"shipping_date"`
	ShippingNo      string  `json:"shipping_no"`
	Status          string  `json:"status"`
	CustomerName    string  `json:"customer_name"`
	LocationName    string  `json:"location_name"`
	SalesOrderNo    string  `json:"sales_order_no"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Qty             float64 `json:"qty"`
	FreightAmount   float64 `json:"freight_amount"`
}

func parseShippingDateFilters(r *http.Request) (shippingDateFilters, map[string]string) {
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
		return shippingDateFilters{}, errs
	}
	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		errs["date_from"] = "Invalid date. Use YYYY-MM-DD."
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		errs["date_to"] = "Invalid date. Use YYYY-MM-DD."
	}
	if len(errs) > 0 {
		return shippingDateFilters{}, errs
	}
	if from.After(to) {
		errs["date_to"] = "End date must be on or after start date."
		return shippingDateFilters{}, errs
	}
	return shippingDateFilters{DateFrom: from, DateTo: to}, nil
}

func optionalInt64(r *http.Request, key string) (*int64, bool) {
	s := strings.TrimSpace(r.URL.Query().Get(key))
	if s == "" {
		return nil, false
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return nil, false
	}
	return &n, true
}

func parseShippingStatusFilters(r *http.Request) (shippingStatusFilters, map[string]string) {
	dr, errs := parseShippingDateFilters(r)
	if errs != nil {
		return shippingStatusFilters{}, errs
	}
	f := shippingStatusFilters{shippingDateFilters: dr}
	if id, ok := optionalInt64(r, "location_id"); ok {
		f.LocationID = id
	}
	if id, ok := optionalInt64(r, "partner_id"); ok {
		f.PartnerID = id
	}
	if id, ok := optionalInt64(r, "item_id"); ok {
		f.ItemID = id
	}
	if id, ok := optionalInt64(r, "sales_order_id"); ok {
		f.SalesOrderID = id
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" {
		f.Status = status
	}
	return f, nil
}

func buildShippingStatusWhere(f shippingStatusFilters, tenantID int64) (string, []any) {
	where := `sh.tenant_id = $1 and sh.shipping_date >= $2::date and sh.shipping_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and sh.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and sh.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.SalesOrderID != nil {
		where += fmt.Sprintf(" and sh.sales_order_id = $%d", argN)
		args = append(args, *f.SalesOrderID)
		argN++
	}
	if f.Status != "" {
		where += fmt.Sprintf(" and sh.status = $%d", argN)
		args = append(args, f.Status)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and sol.item_id = $%d", argN)
		args = append(args, *f.ItemID)
		argN++
	}
	return where, args
}

func shipmentStatusFromClause() string {
	return `
		from public.sh_shipping_orders sh
		join public.sh_shipping_order_lines shl on shl.shipping_order_id = sh.id
		join public.so_sales_order_lines sol on sol.id = shl.sales_order_line_id
		left join public.so_sales_orders so on so.id = sh.sales_order_id
		left join public.inv_partners p on p.id = sh.partner_id
		left join public.inv_locations l on l.id = sh.location_id`
}

func queryShipmentStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f shippingStatusFilters, limit, offset int) ([]shipmentStatusRow, int64, error) {
	where, args := buildShippingStatusWhere(f, tenantID)
	q := fmt.Sprintf(`
		select sh.id, shl.id, sh.shipping_date::text, sh.shipping_no, sh.status,
		  coalesce(p.company_name, ''), coalesce(l.location_name, ''),
		  coalesce(so.sales_order_no, ''), sol.item_code, sol.item_name, shl.qty::float8,
		  coalesce(sh.carrier, ''),
		  count(*) over()
		%s
		where %s
		order by sh.shipping_date desc, sh.shipping_no desc, shl.line_no asc
		limit $%d offset $%d`, shipmentStatusFromClause(), where, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []shipmentStatusRow
	var total int64
	for rows.Next() {
		var row shipmentStatusRow
		if err := rows.Scan(
			&row.ShippingOrderID, &row.LineID, &row.ShippingDate, &row.ShippingNo, &row.Status,
			&row.CustomerName, &row.LocationName, &row.SalesOrderNo, &row.ItemCode, &row.ItemName, &row.Qty,
			&row.Carrier, &total,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []shipmentStatusRow{}
	}
	return out, total, nil
}

func listShipmentStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseShippingStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "shipping_date", map[string]string{"shipping_date": "sh.shipping_date"})
		offset := httputil.Offset(p)
		rows, total, err := queryShipmentStatusRows(r.Context(), pool, tu.TenantID, f, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load shipment status.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=15")
		response.OKList(w, rows, p.Page, p.PageSize, total)
	}
}

func exportShipmentStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseShippingStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryShipmentStatusRows(r.Context(), pool, tu.TenantID, f, shippingReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export shipment status.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="shipment-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Shipping Date", "Shipping No", "Status", "Customer", "Location", "SO No", "Item Code", "Item Name", "Qty", "Carrier"})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.ShippingDate, row.ShippingNo, row.Status, row.CustomerName, row.LocationName,
				row.SalesOrderNo, row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64), row.Carrier,
			})
		}
		cw.Flush()
	}
}

func queryPendingShipmentRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f shippingStatusFilters, limit, offset int) ([]pendingShipmentRow, int64, error) {
	args := []any{tenantID, f.DateFrom, f.DateTo}
	where := `so.tenant_id = $1 and so.deleted_at is null
		and so.order_date >= $2::date and so.order_date <= $3::date
		and so.status not in ('cancelled', 'received')
		and (ln.qty - coalesce(ship.shipped_qty, 0)) > 0.0001`
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and so.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and so.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and ln.item_id = $%d", argN)
		args = append(args, *f.ItemID)
		argN++
	}

	q := fmt.Sprintf(`
		select so.id, ln.id, so.sales_order_no, p.company_name, l.location_name,
		  ln.item_code, ln.item_name, ln.qty::float8,
		  coalesce(ship.shipped_qty, 0)::float8,
		  (ln.qty - coalesce(ship.shipped_qty, 0))::float8,
		  so.delivery_date::text,
		  count(*) over()
		from public.so_sales_orders so
		join public.so_sales_order_lines ln on ln.sales_order_id = so.id
		join public.inv_partners p on p.id = so.partner_id
		join public.inv_locations l on l.id = so.location_id
		left join (
		  select shl.sales_order_line_id, sum(shl.qty) as shipped_qty
		  from public.sh_shipping_order_lines shl
		  join public.sh_shipping_orders sh on sh.id = shl.shipping_order_id
		  where sh.tenant_id = $1
		  group by shl.sales_order_line_id
		) ship on ship.sales_order_line_id = ln.id
		where %s
		order by so.order_date desc, ln.line_no asc
		limit $%d offset $%d`, where, argN, argN+1)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []pendingShipmentRow
	var total int64
	for rows.Next() {
		var row pendingShipmentRow
		var delivery *string
		if err := rows.Scan(
			&row.SalesOrderID, &row.LineID, &row.SalesOrderNo, &row.CustomerName, &row.LocationName,
			&row.ItemCode, &row.ItemName, &row.OrderQty, &row.ShippedQty, &row.PendingQty,
			&delivery, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DeliveryDate = delivery
		out = append(out, row)
	}
	if out == nil {
		out = []pendingShipmentRow{}
	}
	return out, total, nil
}

func listPendingShipmentReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseShippingStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{"order_date": "so.order_date"})
		offset := httputil.Offset(p)
		rows, total, err := queryPendingShipmentRows(r.Context(), pool, tu.TenantID, f, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load pending shipment.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, rows, p.Page, p.PageSize, total)
	}
}

func exportPendingShipmentReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseShippingStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryPendingShipmentRows(r.Context(), pool, tu.TenantID, f, shippingReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export pending shipment.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="pending-shipment.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"SO No", "Customer", "Location", "Item Code", "Item Name", "Order Qty", "Shipped", "Pending", "Delivery Date"})
		for _, row := range rows {
			delivery := ""
			if row.DeliveryDate != nil {
				delivery = *row.DeliveryDate
			}
			_ = cw.Write([]string{
				row.SalesOrderNo, row.CustomerName, row.LocationName, row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.OrderQty, 'f', -1, 64),
				strconv.FormatFloat(row.ShippedQty, 'f', -1, 64),
				strconv.FormatFloat(row.PendingQty, 'f', -1, 64),
				delivery,
			})
		}
		cw.Flush()
	}
}

func queryShippingOrderStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f shippingStatusFilters, limit, offset int) ([]shippingOrderStatusRow, int64, error) {
	where, args := buildShippingStatusWhere(f, tenantID)
	q := fmt.Sprintf(`
		select sh.id, shl.id, sh.shipping_date::text, sh.shipping_no, sh.status,
		  coalesce(p.company_name, ''), coalesce(l.location_name, ''),
		  coalesce(so.sales_order_no, ''), sol.item_code, sol.item_name, shl.qty::float8,
		  coalesce(sh.freight_amount, 0)::float8,
		  count(*) over()
		%s
		where %s
		order by sh.shipping_date desc, sh.shipping_no desc, shl.line_no asc
		limit $%d offset $%d`, shipmentStatusFromClause(), where, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []shippingOrderStatusRow
	var total int64
	for rows.Next() {
		var row shippingOrderStatusRow
		if err := rows.Scan(
			&row.ShippingOrderID, &row.LineID, &row.ShippingDate, &row.ShippingNo, &row.Status,
			&row.CustomerName, &row.LocationName, &row.SalesOrderNo, &row.ItemCode, &row.ItemName, &row.Qty,
			&row.FreightAmount, &total,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []shippingOrderStatusRow{}
	}
	return out, total, nil
}

func listShippingOrderStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseShippingStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "shipping_date", map[string]string{"shipping_date": "sh.shipping_date"})
		offset := httputil.Offset(p)
		rows, total, err := queryShippingOrderStatusRows(r.Context(), pool, tu.TenantID, f, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load shipping order status.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, rows, p.Page, p.PageSize, total)
	}
}

func exportShippingOrderStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseShippingStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryShippingOrderStatusRows(r.Context(), pool, tu.TenantID, f, shippingReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export shipping order status.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="shipping-order-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Shipping Date", "Shipping No", "Status", "Customer", "Location", "SO No", "Item Code", "Item Name", "Qty", "Freight"})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.ShippingDate, row.ShippingNo, row.Status, row.CustomerName, row.LocationName,
				row.SalesOrderNo, row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.FreightAmount, 'f', -1, 64),
			})
		}
		cw.Flush()
	}
}

func registerShippingReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/reports", func(rr chi.Router) {
		rr.With(auth.RequirePermission("shipping_order.shipment_status", auth.AccessRead)).Get("/shipment-status/export", exportShipmentStatusReport(pool))
		rr.With(auth.RequirePermission("shipping_order.shipment_status", auth.AccessRead)).Get("/shipment-status", listShipmentStatusReport(pool))
		rr.With(auth.RequirePermission("shipping_order.pending_shipment", auth.AccessRead)).Get("/pending-shipment/export", exportPendingShipmentReport(pool))
		rr.With(auth.RequirePermission("shipping_order.pending_shipment", auth.AccessRead)).Get("/pending-shipment", listPendingShipmentReport(pool))
		rr.With(auth.RequirePermission("shipping_order.shipping_order_status", auth.AccessRead)).Get("/shipping-order-status/export", exportShippingOrderStatusReport(pool))
		rr.With(auth.RequirePermission("shipping_order.shipping_order_status", auth.AccessRead)).Get("/shipping-order-status", listShippingOrderStatusReport(pool))
	})
}
