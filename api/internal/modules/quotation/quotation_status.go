package quotation

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

const statusReportExportMaxRows = 5000

type dateRangeFilters struct {
	DateFrom time.Time
	DateTo   time.Time
}

type quotationStatusFilters struct {
	dateRangeFilters
	LocationID     *int64
	ProjectID      *int64
	PicUserID      *int64
	PartnerID      *int64
	ItemID         *int64
	ProgressStatus string
	TaxTypeID      *int64
	Validity       string
}

type quotationStatusRow struct {
	QuotationID    int64   `json:"quotation_id"`
	LineID         int64   `json:"line_id"`
	DateNoDisplay  string  `json:"date_no_display"`
	ReferenceNo    string  `json:"reference_no"`
	ProgressStatus string  `json:"progress_status"`
	LocationName   string  `json:"location_name"`
	PicName        string  `json:"pic_name"`
	CustomerName   string  `json:"customer_name"`
	TaxTypeName    string  `json:"tax_type_name"`
	ValidUntil     *string `json:"valid_until,omitempty"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Qty            float64 `json:"qty"`
	LineTotal      float64 `json:"line_total"`
	Remark         *string `json:"remark,omitempty"`
}

type quotationStatusSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type quotationStatusPayload struct {
	Rows    []quotationStatusRow   `json:"rows"`
	Summary quotationStatusSummary `json:"summary"`
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

func parseQuotationStatusFilters(r *http.Request) (quotationStatusFilters, map[string]string) {
	dr, errs := parseDateRangeFilters(r)
	if errs != nil {
		return quotationStatusFilters{}, errs
	}
	f := quotationStatusFilters{dateRangeFilters: dr}
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
	if progress == "unconfirmed" || progress == "in_progress" || progress == "completed" {
		f.ProgressStatus = progress
	}
	validity := strings.TrimSpace(r.URL.Query().Get("validity"))
	if validity == "active" || validity == "expired" || validity == "all" {
		f.Validity = validity
	}
	return f, nil
}

func appendValidityFilter(where string, validity string, argN int) (string, int) {
	switch validity {
	case "active":
		where += fmt.Sprintf(" and (q.valid_until is null or q.valid_until >= $%d::date)", argN)
		return where, argN + 1
	case "expired":
		where += fmt.Sprintf(" and q.valid_until is not null and q.valid_until < $%d::date", argN)
		return where, argN + 1
	default:
		return where, argN
	}
}

func buildQuotationStatusWhere(f quotationStatusFilters, tenantID int64) (string, []any) {
	where := `q.tenant_id = $1 and q.deleted_at is null
		and q.order_date >= $2::date and q.order_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and q.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.ProjectID != nil {
		where += fmt.Sprintf(" and q.project_id = $%d", argN)
		args = append(args, *f.ProjectID)
		argN++
	}
	if f.PicUserID != nil {
		where += fmt.Sprintf(" and q.pic_user_id = $%d", argN)
		args = append(args, *f.PicUserID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and q.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.TaxTypeID != nil {
		where += fmt.Sprintf(" and q.tax_type_id = $%d", argN)
		args = append(args, *f.TaxTypeID)
		argN++
	}
	if f.ProgressStatus != "" {
		where += fmt.Sprintf(" and q.progress_status = $%d", argN)
		args = append(args, f.ProgressStatus)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and ln.item_id = $%d", argN)
		args = append(args, *f.ItemID)
		argN++
	}
	if f.Validity != "" && f.Validity != "all" {
		today := time.Now().Format("2006-01-02")
		where, argN = appendValidityFilter(where, f.Validity, argN)
		args = append(args, today)
	}
	return where, args
}

func quotationStatusFromClause() string {
	return `
		from public.quo_quotations q
		join public.inv_partners p on p.id = q.partner_id
		join public.inv_locations l on l.id = q.location_id
		join public.quo_tax_types tt on tt.id = q.tax_type_id
		join public.quo_quotation_lines ln on ln.quotation_id = q.id`
}

func quotationStatusOrderBy(sort, order string) string {
	allowed := map[string]string{
		"order_date":      "q.order_date",
		"reference_no":    "q.reference_no",
		"progress_status": "q.progress_status",
		"location_name":   "l.location_name",
		"pic_name":        "q.pic_name",
		"customer_name":   "p.company_name",
		"valid_until":     "q.valid_until",
		"item_code":       "ln.item_code",
		"qty":             "ln.qty",
		"line_total":      "ln.line_total",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	return fmt.Sprintf("%s %s, ln.line_no asc", col, orderSQL(order))
}

func queryQuotationStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f quotationStatusFilters, sort, order string, limit, offset int) ([]quotationStatusRow, int64, error) {
	where, args := buildQuotationStatusWhere(f, tenantID)
	orderClause := quotationStatusOrderBy(sort, order)
	q := fmt.Sprintf(`
		select q.id, ln.id, q.order_date, q.date_seq, q.reference_no, q.progress_status,
		  l.location_name, q.pic_name, p.company_name, tt.name, q.valid_until,
		  ln.item_code, ln.item_name, ln.qty::float8, ln.line_total::float8, ln.remark,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		quotationStatusFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []quotationStatusRow
	var total int64
	for rows.Next() {
		var row quotationStatusRow
		var orderDate time.Time
		var dateSeq int
		var validUntil *time.Time
		if err := rows.Scan(
			&row.QuotationID, &row.LineID, &orderDate, &dateSeq, &row.ReferenceNo, &row.ProgressStatus,
			&row.LocationName, &row.PicName, &row.CustomerName, &row.TaxTypeName, &validUntil,
			&row.ItemCode, &row.ItemName, &row.Qty, &row.LineTotal, &row.Remark, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		row.ValidUntil = datePtrToStr(validUntil)
		out = append(out, row)
	}
	if out == nil {
		out = []quotationStatusRow{}
	}
	return out, total, nil
}

func queryQuotationStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f quotationStatusFilters) (quotationStatusSummary, error) {
	where, args := buildQuotationStatusWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.line_total), 0)::float8 %s where %s`,
		quotationStatusFromClause(), where)
	var summary quotationStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalAmount)
	return summary, err
}

func listQuotationStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":      "q.order_date",
		"reference_no":    "q.reference_no",
		"progress_status": "q.progress_status",
		"location_name":   "l.location_name",
		"pic_name":        "q.pic_name",
		"customer_name":   "p.company_name",
		"valid_until":     "q.valid_until",
		"item_code":       "ln.item_code",
		"qty":             "ln.qty",
		"line_total":      "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseQuotationStatusFilters(r)
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

		rows, total, err := queryQuotationStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status report.", "ERR_INTERNAL")
			return
		}
		summary, err := queryQuotationStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: quotationStatusPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportQuotationStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseQuotationStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryQuotationStatusRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export status report.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="quotation-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "Reference No", "Progress Status", "Location Name", "PIC Name",
			"Customer Name", "Tax Type", "Valid Until", "Item Code", "Item Name", "Qty", "Line Total", "Remark",
		})
		for _, row := range rows {
			validUntil := ""
			if row.ValidUntil != nil {
				validUntil = *row.ValidUntil
			}
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.ReferenceNo, formatProgressLabel(row.ProgressStatus),
				row.LocationName, row.PicName, row.CustomerName, row.TaxTypeName, validUntil,
				row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
				remark,
			})
		}
		cw.Flush()
	}
}

func formatProgressLabel(s string) string {
	switch s {
	case "in_progress":
		return "In Progress"
	case "completed":
		return "Completed"
	default:
		return "Unconfirmed"
	}
}
