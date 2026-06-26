package sales

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type discountStatusFilters struct {
	dateRangeFilters
	TaxTypeIDs    []int64
	LocationIDs   []int64
	LocationTypes []string
	ProjectIDs    []int64
	PicUserIDs    []int64
	PartnerIDs    []int64
	DiscountFrom  *float64
	DiscountTo    *float64
	Remark        string
}

type discountStatusRow struct {
	SalesID          int64   `json:"sales_id"`
	OrderDate        string  `json:"order_date"`
	DateNoDisplay    string  `json:"date_no_display"`
	CustomerName     string  `json:"customer_name"`
	SalesAmount      float64 `json:"sales_amount"`
	InvoicingAmount  float64 `json:"invoicing_amount"`
	DifferenceAmount float64 `json:"difference_amount"`
	Remark           string  `json:"remark"`
	ProgressStatus   string  `json:"progress_status"`
	ApprovalLine     string  `json:"approval_line"`
}

type discountStatusSummary struct {
	TotalSalesAmount      float64 `json:"total_sales_amount"`
	TotalInvoicingAmount  float64 `json:"total_invoicing_amount"`
	TotalDifferenceAmount float64 `json:"total_difference_amount"`
}

type discountStatusPayload struct {
	Rows    []discountStatusRow   `json:"rows"`
	Summary discountStatusSummary `json:"summary"`
}

func parseInt64ListQuery(r *http.Request, key string) []int64 {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	var out []int64
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.ParseInt(p, 10, 64)
		if err != nil || n <= 0 {
			continue
		}
		out = append(out, n)
	}
	return out
}

func parseStringListQuery(r *http.Request, key string) []string {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func optionalFloatQuery(r *http.Request, key string) (*float64, bool) {
	s := strings.TrimSpace(r.URL.Query().Get(key))
	if s == "" {
		return nil, false
	}
	n, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil, false
	}
	return &n, true
}

func parseDiscountStatusFilters(r *http.Request) (discountStatusFilters, map[string]string) {
	dr, errs := parseDateRangeFilters(r)
	if errs != nil {
		return discountStatusFilters{}, errs
	}
	f := discountStatusFilters{dateRangeFilters: dr}
	f.TaxTypeIDs = parseInt64ListQuery(r, "tax_type_ids")
	f.LocationIDs = parseInt64ListQuery(r, "location_ids")
	f.LocationTypes = parseStringListQuery(r, "location_types")
	f.ProjectIDs = parseInt64ListQuery(r, "project_ids")
	f.PicUserIDs = parseInt64ListQuery(r, "pic_user_ids")
	f.PartnerIDs = parseInt64ListQuery(r, "partner_ids")
	f.DiscountFrom, _ = optionalFloatQuery(r, "discount_from")
	f.DiscountTo, _ = optionalFloatQuery(r, "discount_to")
	f.Remark = strings.TrimSpace(r.URL.Query().Get("remark"))
	return f, nil
}

func discountStatusFromClause() string {
	return `
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		join public.inv_locations l on l.id = s.location_id
		left join lateral (
		  select coalesce(sum(ln.discount_amount), 0)::float8 as discount_total
		  from public.sa_sales_lines ln
		  where ln.sales_id = s.id
		) disc on true
		left join lateral (
		  select coalesce(string_agg(ln.line_no::text, ', ' order by ln.line_no), '') as approval_line
		  from public.sa_sales_lines ln
		  where ln.sales_id = s.id and ln.discount_amount > 0
		) apvl on true`
}

func buildDiscountStatusWhere(f discountStatusFilters, tenantID int64) (string, []any) {
	where := `s.tenant_id = $1 and s.deleted_at is null
		and s.order_date >= $2::date and s.order_date <= $3::date
		and disc.discount_total > 0`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	n := 4
	if len(f.TaxTypeIDs) > 0 {
		where += fmt.Sprintf(" and s.tax_type_id = any($%d)", n)
		args = append(args, f.TaxTypeIDs)
		n++
	}
	if len(f.LocationIDs) > 0 {
		where += fmt.Sprintf(" and s.location_id = any($%d)", n)
		args = append(args, f.LocationIDs)
		n++
	}
	if len(f.LocationTypes) > 0 {
		where += fmt.Sprintf(" and l.location_type = any($%d)", n)
		args = append(args, f.LocationTypes)
		n++
	}
	if len(f.ProjectIDs) > 0 {
		where += fmt.Sprintf(" and s.project_id = any($%d)", n)
		args = append(args, f.ProjectIDs)
		n++
	}
	if len(f.PicUserIDs) > 0 {
		where += fmt.Sprintf(" and s.pic_user_id = any($%d)", n)
		args = append(args, f.PicUserIDs)
		n++
	}
	if len(f.PartnerIDs) > 0 {
		where += fmt.Sprintf(" and s.partner_id = any($%d)", n)
		args = append(args, f.PartnerIDs)
		n++
	}
	if f.DiscountFrom != nil {
		where += fmt.Sprintf(" and disc.discount_total >= $%d", n)
		args = append(args, *f.DiscountFrom)
		n++
	}
	if f.DiscountTo != nil {
		where += fmt.Sprintf(" and disc.discount_total <= $%d", n)
		args = append(args, *f.DiscountTo)
		n++
	}
	if f.Remark != "" {
		where += fmt.Sprintf(` and (
		  coalesce(s.notes, '') ilike $%d
		  or exists (
		    select 1 from public.sa_sales_lines ln
		    where ln.sales_id = s.id and coalesce(ln.remark, '') ilike $%d
		  )
		)`, n, n)
		args = append(args, "%"+f.Remark+"%")
		n++
	}
	return where, args
}

func discountStatusOrderBy(sort, order, sort2, order2 string) string {
	allowed := map[string]string{
		"order_date":        "s.order_date",
		"customer_name":     "p.company_name",
		"sales_amount":      "(s.grand_total + disc.discount_total)",
		"invoicing_amount":  "s.grand_total",
		"difference_amount": "disc.discount_total",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	parts := []string{fmt.Sprintf("%s %s", col, orderSQL(order))}
	if sort2 != "" && sort2 != sort {
		if c, ok := allowed[sort2]; ok {
			parts = append(parts, fmt.Sprintf("%s %s", c, orderSQL(order2)))
		}
	}
	parts = append(parts, "s.id desc")
	return strings.Join(parts, ", ")
}

func queryDiscountStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f discountStatusFilters, sort, order, sort2, order2 string, limit, offset int) ([]discountStatusRow, int64, error) {
	where, args := buildDiscountStatusWhere(f, tenantID)
	orderClause := discountStatusOrderBy(sort, order, sort2, order2)
	q := fmt.Sprintf(`
		select s.id, s.order_date, s.date_seq, p.company_name,
		  (s.grand_total + disc.discount_total)::float8,
		  s.grand_total::float8,
		  disc.discount_total,
		  coalesce(nullif(btrim(s.notes), ''), ''),
		  s.progress_status,
		  apvl.approval_line,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		discountStatusFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []discountStatusRow
	var total int64
	for rows.Next() {
		var row discountStatusRow
		var orderDate time.Time
		var dateSeq int
		if err := rows.Scan(
			&row.SalesID, &orderDate, &dateSeq, &row.CustomerName,
			&row.SalesAmount, &row.InvoicingAmount, &row.DifferenceAmount, &row.Remark, &row.ProgressStatus, &row.ApprovalLine, &total,
		); err != nil {
			return nil, 0, err
		}
		row.OrderDate = dateToStr(orderDate)
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		out = append(out, row)
	}
	if out == nil {
		out = []discountStatusRow{}
	}
	return out, total, nil
}

func queryDiscountStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f discountStatusFilters) (discountStatusSummary, error) {
	where, args := buildDiscountStatusWhere(f, tenantID)
	q := fmt.Sprintf(`
		select
		  coalesce(sum(s.grand_total + disc.discount_total), 0)::float8,
		  coalesce(sum(s.grand_total), 0)::float8,
		  coalesce(sum(disc.discount_total), 0)::float8
		%s where %s`, discountStatusFromClause(), where)
	var summary discountStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalSalesAmount, &summary.TotalInvoicingAmount, &summary.TotalDifferenceAmount)
	return summary, err
}

func discountStatusAllowedSort() map[string]string {
	return map[string]string{
		"order_date":        "s.order_date",
		"customer_name":     "p.company_name",
		"sales_amount":      "(s.grand_total + disc.discount_total)",
		"invoicing_amount":  "s.grand_total",
		"difference_amount": "disc.discount_total",
	}
}

func listDiscountStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := discountStatusAllowedSort()
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseDiscountStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", allowedSort)
		offset := httputil.Offset(p)
		sortKey := strings.TrimSpace(r.URL.Query().Get("sort"))
		if sortKey == "" {
			sortKey = "order_date"
		}
		sort2 := strings.TrimSpace(r.URL.Query().Get("sort2"))
		order2 := strings.TrimSpace(r.URL.Query().Get("order2"))
		if order2 != "asc" && order2 != "desc" {
			order2 = p.Order
		}
		rows, total, err := queryDiscountStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, sort2, order2, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load discount status report.", "ERR_INTERNAL")
			return
		}
		summary, err := queryDiscountStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load discount status summary.", "ERR_INTERNAL")
			return
		}
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data:    discountStatusPayload{Rows: rows, Summary: summary},
			Meta:    &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportDiscountStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseDiscountStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", discountStatusAllowedSort())
		sortKey := strings.TrimSpace(r.URL.Query().Get("sort"))
		if sortKey == "" {
			sortKey = "order_date"
		}
		sort2 := strings.TrimSpace(r.URL.Query().Get("sort2"))
		order2 := strings.TrimSpace(r.URL.Query().Get("order2"))
		if order2 != "asc" && order2 != "desc" {
			order2 = p.Order
		}
		rows, _, err := queryDiscountStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, sort2, order2, statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export discount status.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="sales-discount-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date", "Customer Name", "Sales Amount", "Invoicing Amount", "Difference Amount", "Apvl. Line", "Remark"})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.DateNoDisplay,
				row.CustomerName,
				fmt.Sprintf("%.4f", row.SalesAmount),
				fmt.Sprintf("%.4f", row.InvoicingAmount),
				fmt.Sprintf("%.4f", row.DifferenceAmount),
				row.ApprovalLine,
				row.Remark,
			})
		}
		cw.Flush()
	}
}
