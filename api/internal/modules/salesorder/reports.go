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
