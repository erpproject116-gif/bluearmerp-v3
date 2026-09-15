package finance

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type agingSummary struct {
	Current    float64 `json:"current"`
	Days1To30  float64 `json:"days_1_30"`
	Days31To60 float64 `json:"days_31_60"`
	Days61To90 float64 `json:"days_61_90"`
	Over90     float64 `json:"over_90"`
	Total      float64 `json:"total"`
}

type arAgingRow struct {
	SalesID      int64   `json:"sales_id"`
	SalesNo      string  `json:"sales_no"`
	CustomerName string  `json:"customer_name"`
	DueDate      string  `json:"due_date"`
	Balance      float64 `json:"balance"`
	AgeDays      int     `json:"age_days"`
	AgeBucket    string  `json:"age_bucket"`
}

type apAgingRow struct {
	SupplierInvoiceID int64   `json:"supplier_invoice_id"`
	InvoiceNo         string  `json:"invoice_no"`
	VendorName        string  `json:"vendor_name"`
	DueDate           string  `json:"due_date"`
	Balance           float64 `json:"balance"`
	AgeDays           int     `json:"age_days"`
	AgeBucket         string  `json:"age_bucket"`
}

type agingListPayload[T any] struct {
	Rows    []T          `json:"rows"`
	Summary agingSummary `json:"summary"`
}

func registerAgingReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/ar-aging/export", exportArAging(pool))
	r.Get("/ar-aging", listArAging(pool))
	r.Get("/ap-aging/export", exportApAging(pool))
	r.Get("/ap-aging", listApAging(pool))
}

func parseAsOfDate(r *http.Request) (time.Time, map[string]string) {
	asOfStr := strings.TrimSpace(r.URL.Query().Get("as_of"))
	if asOfStr == "" {
		now := time.Now().UTC()
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
	}
	asOf, err := parseDate(asOfStr)
	if err != nil {
		return time.Time{}, map[string]string{"as_of": "Invalid date. Use YYYY-MM-DD."}
	}
	return asOf, nil
}

func arAgingSQL(extraWhere string) string {
	return `
		select
		  s.id as sales_id,
		  s.sales_no,
		  p.company_name as customer_name,
		  coalesce(s.due_date, s.order_date)::date::text as due_date,
		  (s.grand_total - coalesce(recv.received, 0))::float8 as balance,
		  greatest(($2::date - coalesce(s.due_date, s.order_date)::date), 0)::int as age_days,
		  case
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 0 then 'current'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 30 then '1-30'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 60 then '31-60'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 90 then '61-90'
		    else '90+'
		  end as age_bucket
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		` + saleAppliedLateralSQLAsOf("s", "$2::date") + `
		where s.tenant_id = $1
		  and s.deleted_at is null
		  and s.order_date <= $2::date
		  and s.progress_status = 'completed'
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001` + extraWhere
}

func apAgingSQL(extraWhere string) string {
	return `
		select
		  supplier_invoice_id, invoice_no, vendor_name, due_date, balance, age_days, age_bucket
		from (
		  select
		    si.id as supplier_invoice_id,
		    si.invoice_no,
		    p.company_name as vendor_name,
		    si.invoice_date::date::text as due_date,
		    (si.grand_total - coalesce(paid.paid, 0))::float8 as balance,
		    greatest(($2::date - si.invoice_date::date), 0)::int as age_days,
		    case
		      when ($2::date - si.invoice_date::date) <= 0 then 'current'
		      when ($2::date - si.invoice_date::date) <= 30 then '1-30'
		      when ($2::date - si.invoice_date::date) <= 60 then '31-60'
		      when ($2::date - si.invoice_date::date) <= 90 then '61-90'
		      else '90+'
		    end as age_bucket
		  from public.fin_supplier_invoices si
		  join public.inv_partners p on p.id = si.partner_id
		  ` + supplierInvoiceAppliedLateralSQLAsOf("si", "$2::date") + `
		  where si.tenant_id = $1
		    and si.deleted_at is null
		    and si.invoice_date <= $2::date
		    and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001` + extraWhere + `
		  union all
		  select
		    e.id,
		    e.expense_no,
		    coalesce(nullif(p.company_name, ''), e.vendor_name),
		    e.expense_date::date::text,
		    (e.amount + e.tax_amount)::float8,
		    greatest(($2::date - e.expense_date::date), 0)::int,
		    case
		      when ($2::date - e.expense_date::date) <= 0 then 'current'
		      when ($2::date - e.expense_date::date) <= 30 then '1-30'
		      when ($2::date - e.expense_date::date) <= 60 then '31-60'
		      when ($2::date - e.expense_date::date) <= 90 then '61-90'
		      else '90+'
		    end
		  from public.fin_expenses e
		  join public.inv_partners p on p.id = e.partner_id
		  where e.tenant_id = $1
		    and e.deleted_at is null
		    and e.payment_status = 'unpaid'
		    and e.partner_id is not null
		    and e.expense_date <= $2::date
		    and (e.amount + e.tax_amount) > 0.0001` + strings.ReplaceAll(extraWhere, "si.", "e.") + `
		) ap_open`
}

func appendAgingSummary(summary *agingSummary, bucket string, balance float64) {
	switch bucket {
	case "current":
		summary.Current += balance
	case "1-30":
		summary.Days1To30 += balance
	case "31-60":
		summary.Days31To60 += balance
	case "61-90":
		summary.Days61To90 += balance
	default:
		summary.Over90 += balance
	}
	summary.Total += balance
}

// loadAgingSummary aggregates buckets across the full open-balance set (not the current page).
func loadAgingSummary(ctx context.Context, pool *pgxpool.Pool, baseSQL string, args []any) (agingSummary, error) {
	var summary agingSummary
	q := fmt.Sprintf(`
		select age_bucket, coalesce(sum(balance), 0)::float8
		from (%s) sub
		group by age_bucket`, baseSQL)
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return summary, err
	}
	defer rows.Close()
	for rows.Next() {
		var bucket string
		var bal float64
		if err := rows.Scan(&bucket, &bal); err != nil {
			return summary, err
		}
		appendAgingSummary(&summary, bucket, bal)
	}
	return summary, rows.Err()
}

func listArAging(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"customer_name": "customer_name", "due_date": "due_date", "balance": "balance", "age_days": "age_days",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, errs := parseAsOfDate(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "age_days", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		args := []any{tu.TenantID, asOf}
		argN := 3
		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "s.partner_id",
			LocationColumn: "s.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		base := arAgingSQL(dsScope)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count A/R ageing.", "ERR_INTERNAL")
			return
		}
		summary, err := loadAgingSummary(r.Context(), pool, base, args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to summarize A/R ageing.", "ERR_INTERNAL")
			return
		}
		pageArgs := append(append([]any{}, args...), p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, orderSQL(p.Order), argN, argN+1)
		rows, err := pool.Query(r.Context(), q, pageArgs...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load A/R ageing.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []arAgingRow
		for rows.Next() {
			var row arAgingRow
			if err := rows.Scan(&row.SalesID, &row.SalesNo, &row.CustomerName, &row.DueDate, &row.Balance, &row.AgeDays, &row.AgeBucket); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read A/R ageing.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []arAgingRow{}
		}
		response.OKList(w, agingListPayload[arAgingRow]{Rows: out, Summary: summary}, p.Page, p.PageSize, total)
	}
}

func exportArAging(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, errs := parseAsOfDate(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		args := []any{tu.TenantID, asOf}
		argN := 3
		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "s.partner_id",
			LocationColumn: "s.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by age_days desc, customer_name asc limit %d", arAgingSQL(dsScope), reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export A/R ageing.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="ar-aging.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Sales No", "Customer", "Due Date", "Balance", "Age (Days)", "Bucket"})
		for rows.Next() {
			var row arAgingRow
			if err := rows.Scan(&row.SalesID, &row.SalesNo, &row.CustomerName, &row.DueDate, &row.Balance, &row.AgeDays, &row.AgeBucket); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.SalesNo,
				row.CustomerName,
				row.DueDate,
				fmt.Sprintf("%.4f", row.Balance),
				fmt.Sprintf("%d", row.AgeDays),
				row.AgeBucket,
			})
		}
		cw.Flush()
	}
}

func listApAging(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"vendor_name": "vendor_name", "due_date": "due_date", "balance": "balance", "age_days": "age_days",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, errs := parseAsOfDate(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "age_days", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		args := []any{tu.TenantID, asOf}
		argN := 3
		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "si.partner_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		base := apAgingSQL(dsScope)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count A/P ageing.", "ERR_INTERNAL")
			return
		}
		summary, err := loadAgingSummary(r.Context(), pool, base, args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to summarize A/P ageing.", "ERR_INTERNAL")
			return
		}
		pageArgs := append(append([]any{}, args...), p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, orderSQL(p.Order), argN, argN+1)
		rows, err := pool.Query(r.Context(), q, pageArgs...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load A/P ageing.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []apAgingRow
		for rows.Next() {
			var row apAgingRow
			if err := rows.Scan(&row.SupplierInvoiceID, &row.InvoiceNo, &row.VendorName, &row.DueDate, &row.Balance, &row.AgeDays, &row.AgeBucket); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read A/P ageing.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []apAgingRow{}
		}
		response.OKList(w, agingListPayload[apAgingRow]{Rows: out, Summary: summary}, p.Page, p.PageSize, total)
	}
}

func exportApAging(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, errs := parseAsOfDate(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		args := []any{tu.TenantID, asOf}
		argN := 3
		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "si.partner_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by age_days desc, vendor_name asc limit %d", apAgingSQL(dsScope), reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export A/P ageing.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="ap-aging.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Invoice No", "Vendor", "Due Date", "Balance", "Age (Days)", "Bucket"})
		for rows.Next() {
			var row apAgingRow
			if err := rows.Scan(&row.SupplierInvoiceID, &row.InvoiceNo, &row.VendorName, &row.DueDate, &row.Balance, &row.AgeDays, &row.AgeBucket); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.InvoiceNo,
				row.VendorName,
				row.DueDate,
				fmt.Sprintf("%.4f", row.Balance),
				fmt.Sprintf("%d", row.AgeDays),
				row.AgeBucket,
			})
		}
		cw.Flush()
	}
}
