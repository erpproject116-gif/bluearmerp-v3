package purchaseorder

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type poAnalysisRow struct {
	PartnerID           int64   `json:"partner_id"`
	VendorName          string  `json:"vendor_name"`
	OrderCount          int64   `json:"order_count"`
	ConfirmedCount      int64   `json:"confirmed_count"`
	PartialCount        int64   `json:"partial_count"`
	ReceivedCount       int64   `json:"received_count"`
	TotalAmount         float64 `json:"total_amount"`
}

type itemsToReceiveRow struct {
	PurchaseOrderID   int64   `json:"purchase_order_id"`
	PurchaseOrderNo   string  `json:"purchase_order_no"`
	OrderDate         string  `json:"order_date"`
	VendorName        string  `json:"vendor_name"`
	LineID            int64   `json:"line_id"`
	ItemCode          string  `json:"item_code"`
	ItemName          string  `json:"item_name"`
	OrderQty          float64 `json:"order_qty"`
	ReceivedQty       float64 `json:"received_qty"`
	PendingQty        float64 `json:"pending_qty"`
}

func registerReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/reports", func(rr chi.Router) {
		rr.Get("/po-analysis/export", exportPOAnalysis(pool))
		rr.Get("/po-analysis", listPOAnalysis(pool))
		rr.Get("/items-to-receive/export", exportItemsToReceive(pool))
		rr.Get("/items-to-receive", listItemsToReceive(pool))
	})
}

func poAnalysisSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	where := "po.tenant_id = $1 and po.deleted_at is null"
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and po.order_date >= $%d::date and po.order_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select coalesce(po.partner_id, 0), coalesce(p.company_name, '(no vendor)'),
		  count(*)::bigint,
		  count(*) filter (where po.status = 'confirmed')::bigint,
		  count(*) filter (where po.status = 'partially_received')::bigint,
		  count(*) filter (where po.status = 'received')::bigint,
		  coalesce(sum(po.grand_total), 0)::float8
		from public.po_purchase_orders po
		left join public.inv_partners p on p.id = po.partner_id
		where %s
		group by po.partner_id, p.company_name`, where)
	return q, args
}

func listPOAnalysis(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"vendor_name": "vendor_name", "order_count": "order_count", "total_amount": "total_amount",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		p := httputil.ParseListParams(r, "total_amount", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base, args := poAnalysisSQL(tu.TenantID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []poAnalysisRow
		for rows.Next() {
			var row poAnalysisRow
			if err := rows.Scan(&row.PartnerID, &row.VendorName, &row.OrderCount,
				&row.ConfirmedCount, &row.PartialCount, &row.ReceivedCount, &row.TotalAmount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []poAnalysisRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportPOAnalysis(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		base, args := poAnalysisSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by total_amount desc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="po-analysis.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Vendor", "Orders", "Confirmed", "Partial", "Received", "Total Amount"})
		for rows.Next() {
			var row poAnalysisRow
			if err := rows.Scan(&row.PartnerID, &row.VendorName, &row.OrderCount,
				&row.ConfirmedCount, &row.PartialCount, &row.ReceivedCount, &row.TotalAmount); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.VendorName,
				fmt.Sprintf("%d", row.OrderCount),
				fmt.Sprintf("%d", row.ConfirmedCount),
				fmt.Sprintf("%d", row.PartialCount),
				fmt.Sprintf("%d", row.ReceivedCount),
				fmt.Sprintf("%.4f", row.TotalAmount),
			})
		}
		cw.Flush()
	}
}

func itemsToReceiveSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	where := `po.tenant_id = $1 and po.deleted_at is null
	  and po.status in ('confirmed', 'partially_received')
	  and (ln.qty - ln.received_qty) > 0.0001`
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and po.order_date >= $%d::date and po.order_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select po.id, po.purchase_order_no, po.order_date::text,
		  coalesce(p.company_name, ln.partner_name, ''),
		  ln.id, ln.item_code, ln.item_name,
		  ln.qty::float8, ln.received_qty::float8,
		  (ln.qty - ln.received_qty)::float8
		from public.po_purchase_order_lines ln
		join public.po_purchase_orders po on po.id = ln.purchase_order_id
		left join public.inv_partners p on p.id = po.partner_id
		where %s`, where)
	return q, args
}

func listItemsToReceive(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"order_date": "order_date", "purchase_order_no": "purchase_order_no", "pending_qty": "pending_qty",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		p := httputil.ParseListParams(r, "pending_qty", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base, args := itemsToReceiveSQL(tu.TenantID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []itemsToReceiveRow
		for rows.Next() {
			var row itemsToReceiveRow
			if err := rows.Scan(&row.PurchaseOrderID, &row.PurchaseOrderNo, &row.OrderDate, &row.VendorName,
				&row.LineID, &row.ItemCode, &row.ItemName, &row.OrderQty, &row.ReceivedQty, &row.PendingQty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []itemsToReceiveRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportItemsToReceive(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		base, args := itemsToReceiveSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by pending_qty desc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="items-to-receive.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"PO No", "Date", "Vendor", "Item Code", "Item Name", "Order Qty", "Received", "Pending"})
		for rows.Next() {
			var row itemsToReceiveRow
			if err := rows.Scan(&row.PurchaseOrderID, &row.PurchaseOrderNo, &row.OrderDate, &row.VendorName,
				&row.LineID, &row.ItemCode, &row.ItemName, &row.OrderQty, &row.ReceivedQty, &row.PendingQty); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.PurchaseOrderNo, row.OrderDate, row.VendorName,
				row.ItemCode, row.ItemName,
				fmt.Sprintf("%.4f", row.OrderQty), fmt.Sprintf("%.4f", row.ReceivedQty), fmt.Sprintf("%.4f", row.PendingQty),
			})
		}
		cw.Flush()
	}
}
