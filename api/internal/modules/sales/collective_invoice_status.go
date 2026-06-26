package sales

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type collectiveInvoiceStatusFilters struct {
	dateRangeFilters
	AccountingSlipNo string
	DepartmentIDs    []int64
	TaxTypeIDs       []int64
	ProjectIDs       []int64
	PicUserIDs       []int64
	PartnerIDs       []int64
	Status           string
}

type collectiveInvoiceStatusRow struct {
	ID                  int64   `json:"id"`
	InvoiceDate         string  `json:"invoice_date"`
	DateNoDisplay       string  `json:"date_no_display"`
	ReceivableNo        string  `json:"receivable_no"`
	CustomerName        string  `json:"customer_name"`
	PretaxAmount        float64 `json:"pretax_amount"`
	SalesTax            float64 `json:"sales_tax"`
	TotalSales          float64 `json:"total_sales"`
	DueDate             *string `json:"due_date,omitempty"`
	Status              string  `json:"status"`
	AccountingSlipNo    string  `json:"accounting_slip_no,omitempty"`
}

type collectiveInvoiceStatusSummary struct {
	TotalPretax   float64 `json:"total_pretax"`
	TotalTax      float64 `json:"total_tax"`
	TotalSales    float64 `json:"total_sales"`
}

type collectiveInvoiceStatusPayload struct {
	Rows    []collectiveInvoiceStatusRow   `json:"rows"`
	Summary collectiveInvoiceStatusSummary `json:"summary"`
}

func parseCollectiveInvoiceStatusFilters(r *http.Request) (collectiveInvoiceStatusFilters, map[string]string) {
	dr, errs := parseDateRangeFilters(r)
	if errs != nil {
		return collectiveInvoiceStatusFilters{}, errs
	}
	f := collectiveInvoiceStatusFilters{dateRangeFilters: dr}
	f.AccountingSlipNo = strings.TrimSpace(r.URL.Query().Get("accounting_slip_no"))
	f.DepartmentIDs = parseInt64ListQuery(r, "department_ids")
	f.TaxTypeIDs = parseInt64ListQuery(r, "tax_type_ids")
	f.ProjectIDs = parseInt64ListQuery(r, "project_ids")
	f.PicUserIDs = parseInt64ListQuery(r, "pic_user_ids")
	f.PartnerIDs = parseInt64ListQuery(r, "partner_ids")
	f.Status = strings.TrimSpace(r.URL.Query().Get("status"))
	if f.Status == "" {
		f.Status = "all"
	}
	return f, nil
}

func buildCollectiveInvoiceStatusWhere(f collectiveInvoiceStatusFilters, tenantID int64) (string, []any) {
	where := `ci.tenant_id = $1 and ci.invoice_date >= $2::date and ci.invoice_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	n := 4
	if f.AccountingSlipNo != "" {
		where += fmt.Sprintf(" and coalesce(ci.accounting_slip_no, '') ilike $%d", n)
		args = append(args, "%"+f.AccountingSlipNo+"%")
		n++
	}
	if f.Status != "" && f.Status != "all" {
		where += fmt.Sprintf(" and ci.status = $%d", n)
		args = append(args, f.Status)
		n++
	}
	if len(f.DepartmentIDs) > 0 {
		where += fmt.Sprintf(" and ci.department_id = any($%d)", n)
		args = append(args, f.DepartmentIDs)
		n++
	}
	if len(f.TaxTypeIDs) > 0 {
		where += fmt.Sprintf(" and ci.tax_type_id = any($%d)", n)
		args = append(args, f.TaxTypeIDs)
		n++
	}
	if len(f.ProjectIDs) > 0 {
		where += fmt.Sprintf(" and ci.project_id = any($%d)", n)
		args = append(args, f.ProjectIDs)
		n++
	}
	if len(f.PicUserIDs) > 0 {
		where += fmt.Sprintf(" and ci.pic_user_id = any($%d)", n)
		args = append(args, f.PicUserIDs)
		n++
	}
	if len(f.PartnerIDs) > 0 {
		where += fmt.Sprintf(" and ci.partner_id = any($%d)", n)
		args = append(args, f.PartnerIDs)
		n++
	}
	return where, args
}

func collectiveInvoiceStatusOrderBy(sort, order, sort2, order2 string) string {
	allowed := map[string]string{
		"invoice_date": "ci.invoice_date",
		"grand_total":  "ci.grand_total",
		"receivable_no": "ci.receivable_no",
		"customer_name": "p.company_name",
	}
	col := allowed[sort]
	if col == "" {
		col = "ci.invoice_date"
	}
	ord := orderSQL(order)
	if sort2 != "" {
		col2 := allowed[sort2]
		if col2 != "" {
			return fmt.Sprintf("%s %s, %s %s", col, ord, col2, orderSQL(order2))
		}
	}
	return fmt.Sprintf("%s %s", col, ord)
}

func queryCollectiveInvoiceStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f collectiveInvoiceStatusFilters, sort, order, sort2, order2 string, limit, offset int) ([]collectiveInvoiceStatusRow, int64, error) {
	where, args := buildCollectiveInvoiceStatusWhere(f, tenantID)
	orderClause := collectiveInvoiceStatusOrderBy(sort, order, sort2, order2)
	q := fmt.Sprintf(`
		select ci.id, ci.invoice_date, ci.date_seq,
		  coalesce(ci.receivable_no, (select coalesce(s.si_dr_no, '') from public.sa_collective_invoice_sales cis join public.sa_sales s on s.id = cis.sales_id where cis.collective_invoice_id = ci.id order by cis.sort_order limit 1), ''),
		  coalesce(p.company_name, ''),
		  ci.subtotal::float8, ci.tax_total::float8, ci.grand_total::float8, ci.due_date,
		  ci.status, coalesce(ci.accounting_slip_no, ''),
		  count(*) over()
		from public.sa_collective_invoices ci
		join public.inv_partners p on p.id = ci.partner_id
		where %s
		order by %s
		limit $%d offset $%d`, where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []collectiveInvoiceStatusRow
	var total int64
	for rows.Next() {
		var row collectiveInvoiceStatusRow
		var invoiceDate time.Time
		var dateSeq int
		var dueDate *time.Time
		if err := rows.Scan(
			&row.ID, &invoiceDate, &dateSeq,
			&row.ReceivableNo, &row.CustomerName,
			&row.PretaxAmount, &row.SalesTax, &row.TotalSales, &dueDate,
			&row.Status, &row.AccountingSlipNo, &total,
		); err != nil {
			return nil, 0, err
		}
		row.InvoiceDate = dateToStr(invoiceDate)
		row.DateNoDisplay = formatDateNoDisplay(invoiceDate, dateSeq)
		row.DueDate = datePtrToStr(dueDate)
		out = append(out, row)
	}
	if out == nil {
		out = []collectiveInvoiceStatusRow{}
	}
	return out, total, nil
}

func queryCollectiveInvoiceStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f collectiveInvoiceStatusFilters) (collectiveInvoiceStatusSummary, error) {
	where, args := buildCollectiveInvoiceStatusWhere(f, tenantID)
	q := fmt.Sprintf(`
		select coalesce(sum(ci.subtotal), 0)::float8, coalesce(sum(ci.tax_total), 0)::float8, coalesce(sum(ci.grand_total), 0)::float8
		from public.sa_collective_invoices ci
		where %s`, where)
	var s collectiveInvoiceStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&s.TotalPretax, &s.TotalTax, &s.TotalSales)
	return s, err
}

func listCollectiveInvoiceStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"invoice_date":  "ci.invoice_date",
		"grand_total":   "ci.grand_total",
		"receivable_no": "ci.receivable_no",
		"customer_name": "p.company_name",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseCollectiveInvoiceStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "invoice_date", allowedSort)
		offset := httputil.Offset(p)
		sort2 := strings.TrimSpace(r.URL.Query().Get("sort2"))
		order2 := strings.TrimSpace(r.URL.Query().Get("order2"))
		sortKey := p.Sort
		if allowedSort[sortKey] == "" {
			sortKey = "invoice_date"
		}
		rows, total, err := queryCollectiveInvoiceStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, sort2, order2, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		summary, err := queryCollectiveInvoiceStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load summary.", "ERR_INTERNAL")
			return
		}
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data:    collectiveInvoiceStatusPayload{Rows: rows, Summary: summary},
			Meta:    &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportCollectiveInvoiceStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseCollectiveInvoiceStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "invoice_date", map[string]string{"invoice_date": "ci.invoice_date"})
		sort2 := strings.TrimSpace(r.URL.Query().Get("sort2"))
		order2 := strings.TrimSpace(r.URL.Query().Get("order2"))
		rows, _, err := queryCollectiveInvoiceStatusRows(r.Context(), pool, tu.TenantID, f, p.Sort, p.Order, sort2, order2, statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="sales-invoice-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date-No.", "Receivable No.", "Customer/Vendor Name", "Pretax Amount", "Sales Tax", "Total Sales", "Due Date", "Status"})
		for _, row := range rows {
			due := ""
			if row.DueDate != nil {
				due = *row.DueDate
			}
			_ = cw.Write([]string{
				row.DateNoDisplay,
				row.ReceivableNo,
				row.CustomerName,
				fmt.Sprintf("%.2f", row.PretaxAmount),
				fmt.Sprintf("%.2f", row.SalesTax),
				fmt.Sprintf("%.2f", row.TotalSales),
				due,
				row.Status,
			})
		}
		cw.Flush()
	}
}
