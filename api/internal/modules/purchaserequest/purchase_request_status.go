package purchaserequest

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

type purchaseRequestStatusFilters struct {
	dateRangeFilters
	LocationID      *int64
	ProjectID       *int64
	PartnerID       *int64
	ItemID          *int64
	DomesticForeign string
	SendStatus      string
	ProgressStatus  string
}

type purchaseRequestStatusRow struct {
	PurchaseRequestID int64   `json:"purchase_request_id"`
	LineID            int64   `json:"line_id"`
	DateNoDisplay     string  `json:"date_no_display"`
	PurchaseRequestNo string  `json:"purchase_request_no"`
	ProgressStatus    string  `json:"progress_status"`
	SendStatus        string  `json:"send_status"`
	DomesticForeign   string  `json:"domestic_foreign"`
	LocationName      string  `json:"location_name"`
	PicName           string  `json:"pic_name"`
	PartnerName       string  `json:"partner_name"`
	ItemCode          string  `json:"item_code"`
	ItemName          string  `json:"item_name"`
	SpecName          *string `json:"spec_name,omitempty"`
	Qty               float64 `json:"qty"`
	LineTotal         float64 `json:"line_total"`
	Remark            *string `json:"remark,omitempty"`
}

type purchaseRequestStatusSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type purchaseRequestStatusPayload struct {
	Rows    []purchaseRequestStatusRow   `json:"rows"`
	Summary purchaseRequestStatusSummary `json:"summary"`
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

func parsePurchaseRequestStatusFilters(r *http.Request) (purchaseRequestStatusFilters, map[string]string) {
	dr, errs := parseDateRangeFilters(r)
	if errs != nil {
		return purchaseRequestStatusFilters{}, errs
	}
	f := purchaseRequestStatusFilters{dateRangeFilters: dr}
	if id, ok := optionalInt64Query(r, "location_id"); ok {
		f.LocationID = id
	}
	if id, ok := optionalInt64Query(r, "project_id"); ok {
		f.ProjectID = id
	}
	if id, ok := optionalInt64Query(r, "partner_id"); ok {
		f.PartnerID = id
	}
	if id, ok := optionalInt64Query(r, "item_id"); ok {
		f.ItemID = id
	}
	df := strings.TrimSpace(r.URL.Query().Get("domestic_foreign"))
	if df == "domestic" || df == "foreign" {
		f.DomesticForeign = df
	}
	ss := strings.TrimSpace(r.URL.Query().Get("send_status"))
	if ss == "unsent" || ss == "sent" {
		f.SendStatus = ss
	}
	progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
	if isValidProgressStatus(progress) {
		f.ProgressStatus = progress
	}
	return f, nil
}

func buildPurchaseRequestStatusWhere(f purchaseRequestStatusFilters, tenantID int64) (string, []any) {
	where := `pr.tenant_id = $1 and pr.deleted_at is null
		and pr.request_date >= $2::date and pr.request_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and pr.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.ProjectID != nil {
		where += fmt.Sprintf(" and pr.project_id = $%d", argN)
		args = append(args, *f.ProjectID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(` and (
			pr.partner_id = $%d or ln.partner_id = $%d)`, argN, argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.DomesticForeign != "" {
		where += fmt.Sprintf(" and pr.domestic_foreign = $%d", argN)
		args = append(args, f.DomesticForeign)
		argN++
	}
	if f.SendStatus != "" {
		where += fmt.Sprintf(" and pr.send_status = $%d", argN)
		args = append(args, f.SendStatus)
		argN++
	}
	if f.ProgressStatus != "" {
		where += fmt.Sprintf(" and pr.progress_status = $%d", argN)
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

func purchaseRequestStatusFromClause() string {
	return `
		from public.pr_purchase_requests pr
		join public.inv_locations l on l.id = pr.location_id
		join public.pr_purchase_request_lines ln on ln.purchase_request_id = pr.id
		left join public.inv_partners hp on hp.id = pr.partner_id
		left join public.inv_partners lp on lp.id = ln.partner_id`
}

func purchaseRequestStatusOrderBy(sort, order string) string {
	allowed := map[string]string{
		"request_date":        "pr.request_date",
		"purchase_request_no": "pr.purchase_request_no",
		"progress_status":     "pr.progress_status",
		"send_status":         "pr.send_status",
		"location_name":       "l.location_name",
		"pic_name":            "pr.pic_name",
		"partner_name":        "coalesce(hp.company_name, lp.company_name, ln.partner_name)",
		"item_code":           "ln.item_code",
		"qty":                 "ln.qty",
		"line_total":          "ln.line_total",
	}
	col := allowed["request_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	return fmt.Sprintf("%s %s, ln.line_no asc", col, orderSQL(order))
}

func queryPurchaseRequestStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f purchaseRequestStatusFilters, sort, order string, limit, offset int) ([]purchaseRequestStatusRow, int64, error) {
	where, args := buildPurchaseRequestStatusWhere(f, tenantID)
	orderClause := purchaseRequestStatusOrderBy(sort, order)
	q := fmt.Sprintf(`
		select pr.id, ln.id, pr.request_date, pr.date_seq, pr.purchase_request_no, pr.progress_status,
		  pr.send_status, pr.domestic_foreign,
		  l.location_name, pr.pic_name,
		  coalesce(hp.company_name, lp.company_name, ln.partner_name, ''),
		  ln.item_code, ln.item_name, ln.spec_name, ln.qty::float8, ln.line_total::float8, ln.remark,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		purchaseRequestStatusFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []purchaseRequestStatusRow
	var total int64
	for rows.Next() {
		var row purchaseRequestStatusRow
		var requestDate time.Time
		var dateSeq int
		if err := rows.Scan(
			&row.PurchaseRequestID, &row.LineID, &requestDate, &dateSeq, &row.PurchaseRequestNo, &row.ProgressStatus,
			&row.SendStatus, &row.DomesticForeign,
			&row.LocationName, &row.PicName, &row.PartnerName,
			&row.ItemCode, &row.ItemName, &row.SpecName, &row.Qty, &row.LineTotal, &row.Remark, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(requestDate, dateSeq)
		out = append(out, row)
	}
	if out == nil {
		out = []purchaseRequestStatusRow{}
	}
	return out, total, nil
}

func queryPurchaseRequestStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f purchaseRequestStatusFilters) (purchaseRequestStatusSummary, error) {
	where, args := buildPurchaseRequestStatusWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.line_total), 0)::float8 %s where %s`,
		purchaseRequestStatusFromClause(), where)
	var summary purchaseRequestStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalAmount)
	return summary, err
}

func listPurchaseRequestStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"request_date":        "pr.request_date",
		"purchase_request_no": "pr.purchase_request_no",
		"progress_status":     "pr.progress_status",
		"send_status":         "pr.send_status",
		"location_name":       "l.location_name",
		"pic_name":            "pr.pic_name",
		"partner_name":        "coalesce(hp.company_name, lp.company_name, ln.partner_name)",
		"item_code":           "ln.item_code",
		"qty":                 "ln.qty",
		"line_total":          "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePurchaseRequestStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "request_date", allowedSort)
		offset := httputil.Offset(p)
		sortKey := strings.TrimSpace(r.URL.Query().Get("sort"))
		if sortKey == "" {
			sortKey = "request_date"
		}

		rows, total, err := queryPurchaseRequestStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status report.", "ERR_INTERNAL")
			return
		}
		summary, err := queryPurchaseRequestStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: purchaseRequestStatusPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportPurchaseRequestStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePurchaseRequestStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryPurchaseRequestStatusRows(r.Context(), pool, tu.TenantID, f, "request_date", "desc", statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export status report.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="purchase-request-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "Purchase Request No", "Progress Status", "Send Status", "Domestic/Foreign",
			"Location Name", "PIC Name", "Partner Name", "Item Code", "Item Name", "Spec Name",
			"Qty", "Line Total", "Remark",
		})
		for _, row := range rows {
			specName := ""
			if row.SpecName != nil {
				specName = *row.SpecName
			}
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.PurchaseRequestNo, formatProgressLabel(row.ProgressStatus),
				row.SendStatus, row.DomesticForeign,
				row.LocationName, row.PicName, row.PartnerName,
				row.ItemCode, row.ItemName, specName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
				remark,
			})
		}
		cw.Flush()
	}
}
