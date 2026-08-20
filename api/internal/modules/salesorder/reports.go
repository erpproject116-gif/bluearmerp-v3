package salesorder

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

type soAnalysisRow struct {
	PartnerID        int64   `json:"partner_id"`
	CustomerName     string  `json:"customer_name"`
	OrderCount       int64   `json:"order_count"`
	UnconfirmedCount int64   `json:"unconfirmed_count"`
	InProgressCount  int64   `json:"in_progress_count"`
	CompletedCount   int64   `json:"completed_count"`
	TotalAmount      float64 `json:"total_amount"`
}

func registerReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/reports", func(rr chi.Router) {
		rr.Get("/so-analysis/export", exportSOAnalysis(pool))
		rr.Get("/so-analysis", listSOAnalysis(pool))
		rr.Get("/fulfillment-progress/export", exportFulfillmentProgress(pool))
		rr.Get("/fulfillment-progress", listFulfillmentProgress(pool))
	})
}

func soAnalysisSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	where := "so.tenant_id = $1 and so.deleted_at is null"
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and so.order_date >= $%d::date and so.order_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select so.partner_id, p.company_name,
		  count(*)::bigint,
		  count(*) filter (where so.progress_status = 'unconfirmed')::bigint,
		  count(*) filter (where so.progress_status = 'in_progress')::bigint,
		  count(*) filter (where so.progress_status = 'completed')::bigint,
		  coalesce(sum(so.grand_total), 0)::float8
		from public.so_sales_orders so
		join public.inv_partners p on p.id = so.partner_id
		where %s
		group by so.partner_id, p.company_name`, where)
	return q, args
}

func listSOAnalysis(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"customer_name": "customer_name", "order_count": "order_count", "total_amount": "total_amount",
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
		base, args := soAnalysisSQL(tu.TenantID, dateFrom, dateTo)
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
		out := scanSOAnalysisRows(rows, w)
		if out == nil {
			return
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func scanSOAnalysisRows(rows interface {
	Next() bool
	Scan(dest ...any) error
}, w http.ResponseWriter) []soAnalysisRow {
	var out []soAnalysisRow
	for rows.Next() {
		var row soAnalysisRow
		if err := rows.Scan(&row.PartnerID, &row.CustomerName, &row.OrderCount,
			&row.UnconfirmedCount, &row.InProgressCount, &row.CompletedCount, &row.TotalAmount); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
			return nil
		}
		out = append(out, row)
	}
	if out == nil {
		out = []soAnalysisRow{}
	}
	return out
}

func exportSOAnalysis(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		base, args := soAnalysisSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by total_amount desc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="so-analysis.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Customer", "Orders", "Unconfirmed", "In Progress", "Completed", "Total Amount"})
		for rows.Next() {
			var row soAnalysisRow
			if err := rows.Scan(&row.PartnerID, &row.CustomerName, &row.OrderCount,
				&row.UnconfirmedCount, &row.InProgressCount, &row.CompletedCount, &row.TotalAmount); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.CustomerName,
				fmt.Sprintf("%d", row.OrderCount),
				fmt.Sprintf("%d", row.UnconfirmedCount),
				fmt.Sprintf("%d", row.InProgressCount),
				fmt.Sprintf("%d", row.CompletedCount),
				fmt.Sprintf("%.4f", row.TotalAmount),
			})
		}
		cw.Flush()
	}
}

type fulfillmentProgressRow struct {
	SalesOrderID   int64   `json:"sales_order_id"`
	SalesOrderNo   string  `json:"sales_order_no"`
	OrderDate      string  `json:"order_date"`
	CustomerName   string  `json:"customer_name"`
	ProgressStatus string  `json:"progress_status"`
	PctDelivered   float64 `json:"pct_delivered"`
	PctBilled      float64 `json:"pct_billed"`
	GrandTotal     float64 `json:"grand_total"`
}

type fulfillmentProgressSummary struct {
	FullyDelivered    int64 `json:"fully_delivered"`
	PartiallyDelivered int64 `json:"partially_delivered"`
	NotDelivered      int64 `json:"not_delivered"`
	FullyBilled       int64 `json:"fully_billed"`
	PartiallyBilled   int64 `json:"partially_billed"`
	NotBilled         int64 `json:"not_billed"`
}

type fulfillmentProgressPayload struct {
	Rows     []fulfillmentProgressRow   `json:"rows"`
	Summary  fulfillmentProgressSummary `json:"summary"`
	Total    int64                      `json:"total"`
	Page     int                        `json:"page"`
	PageSize int                        `json:"page_size"`
}

func fulfillmentProgressSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	where := "so.tenant_id = $1 and so.deleted_at is null"
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and so.order_date >= $%d::date and so.order_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select so.id, so.sales_order_no, so.order_date::text, p.company_name, so.progress_status,
		  coalesce((
		    select case when sum(ln.qty) > 0.0001
		      then round(100.0 * sum(coalesce(ln.delivered_qty, 0)) / sum(ln.qty), 1) else 0 end
		    from public.so_sales_order_lines ln where ln.sales_order_id = so.id
		  ), 0)::float8,
		  coalesce((
		    select case when sum(ln.qty) > 0.0001
		      then round(100.0 * sum(coalesce(ln.billed_qty, 0)) / sum(ln.qty), 1) else 0 end
		    from public.so_sales_order_lines ln where ln.sales_order_id = so.id
		  ), 0)::float8,
		  so.grand_total::float8
		from public.so_sales_orders so
		join public.inv_partners p on p.id = so.partner_id
		where %s`, where)
	return q, args
}

func scanFulfillmentSummary(rows []fulfillmentProgressRow) fulfillmentProgressSummary {
	var s fulfillmentProgressSummary
	for _, row := range rows {
		switch {
		case row.PctDelivered >= 99.9:
			s.FullyDelivered++
		case row.PctDelivered > 0:
			s.PartiallyDelivered++
		default:
			s.NotDelivered++
		}
		switch {
		case row.PctBilled >= 99.9:
			s.FullyBilled++
		case row.PctBilled > 0:
			s.PartiallyBilled++
		default:
			s.NotBilled++
		}
	}
	return s
}

func listFulfillmentProgress(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"order_date": "order_date", "sales_order_no": "sales_order_no",
		"customer_name": "customer_name", "pct_delivered": "pct_delivered", "pct_billed": "pct_billed",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		p := httputil.ParseListParams(r, "order_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base, args := fulfillmentProgressSQL(tu.TenantID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}

		summaryBase, summaryArgs := fulfillmentProgressSQL(tu.TenantID, dateFrom, dateTo)
		summaryQ := fmt.Sprintf("select * from (%s) sub order by order_date desc limit %d", summaryBase, reports.ExportMaxRows)
		summaryRows, err := pool.Query(r.Context(), summaryQ, summaryArgs...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load summary.", "ERR_INTERNAL")
			return
		}
		allRows := scanFulfillmentProgressRows(summaryRows, w)
		summaryRows.Close()
		if allRows == nil {
			return
		}
		summary := scanFulfillmentSummary(allRows)

		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		pageRows := scanFulfillmentProgressRows(rows, w)
		if pageRows == nil {
			return
		}
		response.OK(w, fulfillmentProgressPayload{
			Rows: pageRows, Summary: summary, Total: total, Page: p.Page, PageSize: p.PageSize,
		}, "OK")
	}
}

func scanFulfillmentProgressRows(rows interface {
	Next() bool
	Scan(dest ...any) error
}, w http.ResponseWriter) []fulfillmentProgressRow {
	var out []fulfillmentProgressRow
	for rows.Next() {
		var row fulfillmentProgressRow
		if err := rows.Scan(
			&row.SalesOrderID, &row.SalesOrderNo, &row.OrderDate, &row.CustomerName,
			&row.ProgressStatus, &row.PctDelivered, &row.PctBilled, &row.GrandTotal,
		); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
			return nil
		}
		out = append(out, row)
	}
	if out == nil {
		out = []fulfillmentProgressRow{}
	}
	return out
}

func exportFulfillmentProgress(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		base, args := fulfillmentProgressSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by order_date desc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="fulfillment-progress.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"SO No.", "Order Date", "Customer", "Progress", "% Delivered", "% Billed", "Grand Total"})
		for rows.Next() {
			var row fulfillmentProgressRow
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderNo, &row.OrderDate, &row.CustomerName,
				&row.ProgressStatus, &row.PctDelivered, &row.PctBilled, &row.GrandTotal,
			); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.SalesOrderNo,
				row.OrderDate,
				row.CustomerName,
				row.ProgressStatus,
				fmt.Sprintf("%.1f", row.PctDelivered),
				fmt.Sprintf("%.1f", row.PctBilled),
				fmt.Sprintf("%.4f", row.GrandTotal),
			})
		}
		cw.Flush()
	}
}
