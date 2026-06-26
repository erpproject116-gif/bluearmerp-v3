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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const reportExportMaxRows = 5000

type arByCustomerRow struct {
	PartnerID     int64   `json:"partner_id"`
	CustomerName  string  `json:"customer_name"`
	TotalSales    float64 `json:"total_sales"`
	TotalReceived float64 `json:"total_received"`
	Balance       float64 `json:"balance"`
}

type receiptStatusRow struct {
	SalesID         int64   `json:"sales_id"`
	LineID          int64   `json:"line_id"`
	DateNoDisplay   string  `json:"date_no_display"`
	SalesNo         string  `json:"sales_no"`
	CustomerName    string  `json:"customer_name"`
	PartnerID       int64   `json:"partner_id"`
	GrandTotal      float64 `json:"grand_total"`
	ReceivedAmount  float64 `json:"received_amount"`
	Balance         float64 `json:"balance"`
	ReceiptStatus   string  `json:"receipt_status"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Qty             float64 `json:"qty"`
	LineTotal       float64 `json:"line_total"`
}

type receiptStatusSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type receiptStatusPayload struct {
	Rows    []receiptStatusRow   `json:"rows"`
	Summary receiptStatusSummary `json:"summary"`
}

func registerReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/ar-by-customer/export", exportArByCustomer(pool))
	r.Get("/ar-by-customer", listArByCustomer(pool))
	r.Get("/receipt-status/export", exportReceiptStatus(pool))
	r.Get("/receipt-status", listReceiptStatus(pool))
	r.Get("/official-receipt-status/export", exportOfficialReceiptStatus(pool))
	r.Get("/official-receipt-status", listOfficialReceiptStatus(pool))
}

func parseOptionalDateRange(r *http.Request) (*time.Time, *time.Time, map[string]string) {
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	if fromStr == "" && toStr == "" {
		return nil, nil, nil
	}
	errs := map[string]string{}
	if fromStr == "" {
		errs["date_from"] = "Start date is required when filtering by date."
	}
	if toStr == "" {
		errs["date_to"] = "End date is required when filtering by date."
	}
	if len(errs) > 0 {
		return nil, nil, errs
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
		return nil, nil, errs
	}
	if from.After(to) {
		errs["date_to"] = "End date must be on or after start date."
		return nil, nil, errs
	}
	return &from, &to, nil
}

func arByCustomerBaseSQL(tenantID int64, dateFrom, dateTo *time.Time, partnerID, locationID, departmentID, projectID, picUserID *int64) (string, []any) {
	args := []any{tenantID}
	argN := 2
	dateFilter := ""
	if dateFrom != nil && dateTo != nil {
		dateFilter = fmt.Sprintf(" and s.order_date >= $%d::date and s.order_date <= $%d::date", argN, argN+1)
		args = append(args, *dateFrom, *dateTo)
		argN += 2
	}
	partnerFilter := ""
	if partnerID != nil {
		partnerFilter = fmt.Sprintf(" and s.partner_id = $%d", argN)
		args = append(args, *partnerID)
		argN++
	}
	if locationID != nil {
		partnerFilter += fmt.Sprintf(" and s.location_id = $%d", argN)
		args = append(args, *locationID)
		argN++
	}
	if departmentID != nil {
		partnerFilter += fmt.Sprintf(" and s.department_id = $%d", argN)
		args = append(args, *departmentID)
		argN++
	}
	if projectID != nil {
		partnerFilter += fmt.Sprintf(" and s.project_id = $%d", argN)
		args = append(args, *projectID)
		argN++
	}
	if picUserID != nil {
		partnerFilter += fmt.Sprintf(" and s.pic_user_id = $%d", argN)
		args = append(args, *picUserID)
		argN++
	}

	q := fmt.Sprintf(`
		select s.partner_id, p.company_name,
		  coalesce(sum(s.grand_total), 0)::float8 as total_sales,
		  coalesce(sum(recv.received), 0)::float8 as total_received,
		  coalesce(sum(s.grand_total), 0)::float8 - coalesce(sum(recv.received), 0)::float8 as balance
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null%s%s
		group by s.partner_id, p.company_name
		having coalesce(sum(s.grand_total), 0) > 0`,
		dateFilter, partnerFilter)
	return q, args
}

func listArByCustomer(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"customer_name":  "customer_name",
		"total_sales":    "total_sales",
		"total_received": "total_received",
		"balance":        "balance",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		p := httputil.ParseListParams(r, "customer_name", allowed)
		offset := httputil.Offset(p)
		partnerID, _ := optionalInt64Query(r, "partner_id")
		locationID, _ := optionalInt64Query(r, "location_id")
		departmentID, _ := optionalInt64Query(r, "department_id")
		projectID, _ := optionalInt64Query(r, "project_id")
		picUserID, _ := optionalInt64Query(r, "pic_user_id")

		base, args := arByCustomerBaseSQL(tu.TenantID, dateFrom, dateTo, partnerID, locationID, departmentID, projectID, picUserID)
		q := fmt.Sprintf(`select * from (%s) ar order by %s %s limit $%d offset $%d`,
			base, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)

		countQ := fmt.Sprintf(`select count(*) from (%s) ar`, base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count A/R report.", "ERR_INTERNAL")
			return
		}

		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load A/R report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []arByCustomerRow
		for rows.Next() {
			var row arByCustomerRow
			if err := rows.Scan(&row.PartnerID, &row.CustomerName, &row.TotalSales, &row.TotalReceived, &row.Balance); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read A/R report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []arByCustomerRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportArByCustomer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		partnerID, _ := optionalInt64Query(r, "partner_id")
		locationID, _ := optionalInt64Query(r, "location_id")
		departmentID, _ := optionalInt64Query(r, "department_id")
		projectID, _ := optionalInt64Query(r, "project_id")
		picUserID, _ := optionalInt64Query(r, "pic_user_id")
		base, args := arByCustomerBaseSQL(tu.TenantID, dateFrom, dateTo, partnerID, locationID, departmentID, projectID, picUserID)
		q := fmt.Sprintf(`select * from (%s) ar order by customer_name asc limit %d`, base, reportExportMaxRows)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export A/R report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="ar-by-customer.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Customer", "Total Sales", "Total Received", "Balance"})
		for rows.Next() {
			var row arByCustomerRow
			if err := rows.Scan(&row.PartnerID, &row.CustomerName, &row.TotalSales, &row.TotalReceived, &row.Balance); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.CustomerName,
				fmt.Sprintf("%.4f", row.TotalSales),
				fmt.Sprintf("%.4f", row.TotalReceived),
				fmt.Sprintf("%.4f", row.Balance),
			})
		}
		cw.Flush()
	}
}

type receiptStatusFilters struct {
	DateFrom       *time.Time
	DateTo         *time.Time
	PartnerID      *int64
	ReceiptStatus  string
}

func parseReceiptStatusFilters(r *http.Request) (receiptStatusFilters, map[string]string) {
	f := receiptStatusFilters{}
	dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
	if dateErrs != nil {
		return f, dateErrs
	}
	f.DateFrom = dateFrom
	f.DateTo = dateTo
	if id, ok := optionalInt64Query(r, "partner_id"); ok {
		f.PartnerID = id
	}
	status := strings.TrimSpace(r.URL.Query().Get("receipt_status"))
	if status == "none" || status == "partial" || status == "full" {
		f.ReceiptStatus = status
	}
	return f, nil
}

func receiptStatusFromClause() string {
	return `
		from public.sa_sales s
		join public.sa_sales_lines ln on ln.sales_id = s.id
		join public.inv_partners p on p.id = s.partner_id
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true`
}

func buildReceiptStatusWhere(f receiptStatusFilters, tenantID int64) (string, []any) {
	where := `s.tenant_id = $1 and s.deleted_at is null`
	args := []any{tenantID}
	argN := 2
	if f.DateFrom != nil && f.DateTo != nil {
		where += fmt.Sprintf(" and s.order_date >= $%d::date and s.order_date <= $%d::date", argN, argN+1)
		args = append(args, *f.DateFrom, *f.DateTo)
		argN += 2
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and s.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	switch f.ReceiptStatus {
	case "none":
		where += " and coalesce(recv.received, 0) = 0"
	case "partial":
		where += " and coalesce(recv.received, 0) > 0 and coalesce(recv.received, 0) < s.grand_total"
	case "full":
		where += " and coalesce(recv.received, 0) >= s.grand_total"
	}
	return where, args
}

func receiptStatusLabel(received, grandTotal float64) string {
	if received <= 0 {
		return "none"
	}
	if received >= grandTotal {
		return "full"
	}
	return "partial"
}

func queryReceiptStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f receiptStatusFilters, sort, order string, limit, offset int) ([]receiptStatusRow, int64, error) {
	where, args := buildReceiptStatusWhere(f, tenantID)
	allowed := map[string]string{
		"order_date":     "s.order_date",
		"sales_no":       "s.sales_no",
		"customer_name":  "p.company_name",
		"grand_total":    "s.grand_total",
		"received_amount": "recv.received",
		"balance":        "(s.grand_total - coalesce(recv.received, 0))",
		"item_code":      "ln.item_code",
		"qty":            "ln.qty",
		"line_total":     "ln.line_total",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	orderClause := fmt.Sprintf("%s %s, ln.line_no asc", col, orderSQL(order))

	q := fmt.Sprintf(`
		select s.id, ln.id, s.order_date, s.date_seq, s.sales_no,
		  p.company_name, s.partner_id, s.grand_total::float8,
		  coalesce(recv.received, 0)::float8,
		  (s.grand_total - coalesce(recv.received, 0))::float8,
		  ln.item_code, ln.item_name, ln.qty::float8, ln.line_total::float8,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		receiptStatusFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []receiptStatusRow
	var total int64
	for rows.Next() {
		var row receiptStatusRow
		var orderDate time.Time
		var dateSeq int
		if err := rows.Scan(
			&row.SalesID, &row.LineID, &orderDate, &dateSeq, &row.SalesNo,
			&row.CustomerName, &row.PartnerID, &row.GrandTotal,
			&row.ReceivedAmount, &row.Balance,
			&row.ItemCode, &row.ItemName, &row.Qty, &row.LineTotal, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		row.ReceiptStatus = receiptStatusLabel(row.ReceivedAmount, row.GrandTotal)
		out = append(out, row)
	}
	if out == nil {
		out = []receiptStatusRow{}
	}
	return out, total, nil
}

func queryReceiptStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f receiptStatusFilters) (receiptStatusSummary, error) {
	where, args := buildReceiptStatusWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.line_total), 0)::float8 %s where %s`,
		receiptStatusFromClause(), where)
	var summary receiptStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalAmount)
	return summary, err
}

func listReceiptStatus(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":      "s.order_date",
		"sales_no":        "s.sales_no",
		"customer_name":   "p.company_name",
		"grand_total":     "s.grand_total",
		"received_amount": "recv.received",
		"balance":         "(s.grand_total - coalesce(recv.received, 0))",
		"item_code":       "ln.item_code",
		"qty":             "ln.qty",
		"line_total":      "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseReceiptStatusFilters(r)
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

		rows, total, err := queryReceiptStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load receipt status.", "ERR_INTERNAL")
			return
		}
		summary, err := queryReceiptStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load receipt status summary.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: receiptStatusPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportReceiptStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseReceiptStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryReceiptStatusRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", reportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export receipt status.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="receipt-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "Sales No.", "Customer", "Grand Total", "Received", "Balance", "Receipt Status",
			"Item Code", "Item Name", "Qty", "Line Total",
		})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.DateNoDisplay,
				row.SalesNo,
				row.CustomerName,
				fmt.Sprintf("%.4f", row.GrandTotal),
				fmt.Sprintf("%.4f", row.ReceivedAmount),
				fmt.Sprintf("%.4f", row.Balance),
				row.ReceiptStatus,
				row.ItemCode,
				row.ItemName,
				fmt.Sprintf("%.4f", row.Qty),
				fmt.Sprintf("%.4f", row.LineTotal),
			})
		}
		cw.Flush()
	}
}
