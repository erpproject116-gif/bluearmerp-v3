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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const statusReportExportMaxRows = 5000

type dateRangeFilters struct {
	DateFrom time.Time
	DateTo   time.Time
}

type salesStatusFilters struct {
	dateRangeFilters
	LocationID     *int64
	ProjectID      *int64
	PicUserID      *int64
	PartnerID      *int64
	ItemID         *int64
	ProgressStatus string
	TaxTypeID      *int64
	ReportType     string
}

type salesStatusRow struct {
	SalesID        int64   `json:"sales_id"`
	LineID         int64   `json:"line_id"`
	DateNoDisplay  string  `json:"date_no_display"`
	SalesNo        string  `json:"sales_no"`
	ProgressStatus string  `json:"progress_status"`
	LocationName   string  `json:"location_name"`
	PicName        string  `json:"pic_name"`
	CustomerName   string  `json:"customer_name"`
	TaxTypeName    string  `json:"tax_type_name"`
	DueDate        *string `json:"due_date,omitempty"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Qty            float64 `json:"qty"`
	LineTotal      float64 `json:"line_total"`
	Remark         *string `json:"remark,omitempty"`
}

type salesStatusSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type salesStatusPayload struct {
	Rows    []salesStatusRow   `json:"rows"`
	Summary salesStatusSummary `json:"summary"`
}

func parseDateRangeFilters(r *http.Request) (dateRangeFilters, map[string]string) {
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
		return dateRangeFilters{}, errs
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
		return dateRangeFilters{}, errs
	}
	if from.After(to) {
		errs["date_to"] = "End date must be on or after start date."
		return dateRangeFilters{}, errs
	}
	return dateRangeFilters{DateFrom: from, DateTo: to}, nil
}

func optionalInt64Query(r *http.Request, key string) (*int64, bool) {
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

func parseSalesStatusFilters(r *http.Request, tu auth.TenantUser) (salesStatusFilters, map[string]string) {
	dr, errs := parseDateRangeFilters(r)
	if errs != nil {
		return salesStatusFilters{}, errs
	}
	f := salesStatusFilters{dateRangeFilters: dr}
	if id, ok := optionalInt64Query(r, "location_id"); ok {
		f.LocationID = id
	}
	if id, ok := optionalInt64Query(r, "project_id"); ok {
		f.ProjectID = id
	}
	if id, ok := optionalInt64Query(r, "pic_user_id"); ok {
		f.PicUserID = id
	}
	if id, ok := optionalInt64Query(r, "partner_id"); ok {
		f.PartnerID = id
	}
	if id, ok := optionalInt64Query(r, "item_id"); ok {
		f.ItemID = id
	}
	if id, ok := optionalInt64Query(r, "tax_type_id"); ok {
		f.TaxTypeID = id
	}
	progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
	if progress == "unconfirmed" || progress == "completed" {
		f.ProgressStatus = progress
	}
	rt := strings.TrimSpace(r.URL.Query().Get("report_type"))
	switch rt {
	case "summary", "by_line":
		f.ReportType = rt
	default:
		f.ReportType = "details"
	}
	f.LocationID = datascope.ResolveLocationFilter(tu, f.LocationID)
	return f, nil
}

func buildSalesStatusWhere(f salesStatusFilters, tenantID int64) (string, []any) {
	where := `s.tenant_id = $1 and s.deleted_at is null
		and s.order_date >= $2::date and s.order_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and s.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.ProjectID != nil {
		where += fmt.Sprintf(" and s.project_id = $%d", argN)
		args = append(args, *f.ProjectID)
		argN++
	}
	if f.PicUserID != nil {
		where += fmt.Sprintf(" and s.pic_user_id = $%d", argN)
		args = append(args, *f.PicUserID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and s.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.TaxTypeID != nil {
		where += fmt.Sprintf(" and s.tax_type_id = $%d", argN)
		args = append(args, *f.TaxTypeID)
		argN++
	}
	if f.ProgressStatus != "" {
		where += fmt.Sprintf(" and s.progress_status = $%d", argN)
		args = append(args, f.ProgressStatus)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and ln.item_id = $%d", argN)
		args = append(args, *f.ItemID)
		argN++
	}
	return where, args
}

func salesStatusFromClause(f salesStatusFilters) string {
	switch f.ReportType {
	case "summary":
		return `
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		join public.inv_locations l on l.id = s.location_id
		join public.quo_tax_types tt on tt.id = s.tax_type_id
		join public.sa_sales_lines ln on ln.sales_id = s.id`
	case "by_line":
		return `
		from public.sa_sales s
		join public.sa_sales_lines ln on ln.sales_id = s.id`
	default:
		return `
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		join public.inv_locations l on l.id = s.location_id
		join public.quo_tax_types tt on tt.id = s.tax_type_id
		join public.sa_sales_lines ln on ln.sales_id = s.id`
	}
}

func salesStatusSelect(f salesStatusFilters) string {
	switch f.ReportType {
	case "summary":
		return `select s.id, 0::bigint, s.order_date, s.date_seq, s.sales_no, s.progress_status,
		  l.location_name, s.pic_name, p.company_name, tt.name, s.due_date,
		  ''::varchar, '(summary)'::text, coalesce(sum(ln.qty), 0)::float8,
		  coalesce(sum(ln.line_total), 0)::float8, null::text`
	case "by_line":
		return `select 0::bigint, 0::bigint, min(s.order_date), 0, '—'::varchar, ''::varchar,
		  '—'::text, '—'::text, '—'::text, ''::text, null::date,
		  ln.item_code, ln.item_name, coalesce(sum(ln.qty), 0)::float8,
		  coalesce(sum(ln.line_total), 0)::float8, null::text`
	default:
		return `select s.id, ln.id, s.order_date, s.date_seq, s.sales_no, s.progress_status,
		  l.location_name, s.pic_name, p.company_name, tt.name, s.due_date,
		  ln.item_code, ln.item_name, ln.qty::float8, ln.line_total::float8, ln.remark`
	}
}

func salesStatusGroupBy(f salesStatusFilters) string {
	switch f.ReportType {
	case "summary":
		return ` group by s.id, s.order_date, s.date_seq, s.sales_no, s.progress_status,
		  l.location_name, s.pic_name, p.company_name, tt.name, s.due_date`
	case "by_line":
		return ` group by ln.item_id, ln.item_code, ln.item_name`
	default:
		return ""
	}
}

func salesStatusOrderBy(f salesStatusFilters, sort, order string) string {
	if f.ReportType == "by_line" {
		return "item_code asc"
	}
	allowed := map[string]string{
		"order_date":      "order_date",
		"sales_no":        "sales_no",
		"progress_status": "progress_status",
		"location_name":   "location_name",
		"pic_name":        "pic_name",
		"customer_name":   "customer_name",
		"due_date":        "due_date",
		"item_code":       "item_code",
		"qty":             "qty",
		"line_total":      "line_total",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	if f.ReportType == "details" {
		return fmt.Sprintf("%s %s, line_id asc", col, orderSQL(order))
	}
	return fmt.Sprintf("%s %s", col, orderSQL(order))
}

func querySalesStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f salesStatusFilters, sort, order string, limit, offset int) ([]salesStatusRow, int64, error) {
	where, args := buildSalesStatusWhere(f, tenantID)
	orderClause := salesStatusOrderBy(f, sort, order)
	q := fmt.Sprintf(`%s %s where %s%s order by %s limit $%d offset $%d`,
		salesStatusSelect(f), salesStatusFromClause(f), where, salesStatusGroupBy(f),
		orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []salesStatusRow
	for rows.Next() {
		var row salesStatusRow
		var orderDate time.Time
		var dateSeq int
		var dueDate *time.Time
		if err := rows.Scan(
			&row.SalesID, &row.LineID, &orderDate, &dateSeq, &row.SalesNo, &row.ProgressStatus,
			&row.LocationName, &row.PicName, &row.CustomerName, &row.TaxTypeName, &dueDate,
			&row.ItemCode, &row.ItemName, &row.Qty, &row.LineTotal, &row.Remark,
		); err != nil {
			return nil, 0, err
		}
		if f.ReportType == "by_line" {
			row.DateNoDisplay = "—"
		} else {
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		}
		row.DueDate = datePtrToStr(dueDate)
		out = append(out, row)
	}

	countQ := fmt.Sprintf(`select count(*) from (select 1 %s where %s%s) sub`,
		salesStatusFromClause(f), where, salesStatusGroupBy(f))
	var total int64
	if err := pool.QueryRow(ctx, countQ, args[:len(args)-2]...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if out == nil {
		out = []salesStatusRow{}
	}
	return out, total, nil
}

func querySalesStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f salesStatusFilters) (salesStatusSummary, error) {
	where, args := buildSalesStatusWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.line_total), 0)::float8 %s where %s`,
		salesStatusFromClause(f), where)
	var summary salesStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalAmount)
	return summary, err
}

func listSalesStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":      "s.order_date",
		"sales_no":        "s.sales_no",
		"progress_status": "s.progress_status",
		"location_name":   "l.location_name",
		"pic_name":        "s.pic_name",
		"customer_name":   "p.company_name",
		"due_date":        "s.due_date",
		"item_code":       "ln.item_code",
		"qty":             "ln.qty",
		"line_total":      "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseSalesStatusFilters(r, tu)
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

		rows, total, err := querySalesStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status report.", "ERR_INTERNAL")
			return
		}
		summary, err := querySalesStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: salesStatusPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportSalesStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseSalesStatusFilters(r, tu)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := querySalesStatusRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export status report.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="sales-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "Sales No", "Progress Status", "Location Name", "PIC Name",
			"Customer Name", "Tax Type", "Due Date", "Item Code", "Item Name", "Qty", "Line Total", "Remark",
		})
		for _, row := range rows {
			dueDate := ""
			if row.DueDate != nil {
				dueDate = *row.DueDate
			}
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.SalesNo, formatProgressLabel(row.ProgressStatus),
				row.LocationName, row.PicName, row.CustomerName, row.TaxTypeName, dueDate,
				row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
				remark,
			})
		}
		cw.Flush()
	}
}
