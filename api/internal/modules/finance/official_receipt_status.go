package finance

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

type officialReceiptStatusFilters struct {
	DateFrom          time.Time
	DateTo            time.Time
	PartnerID         *int64
	LocationID        *int64
	DepartmentID      *int64
	ProjectID         *int64
	PicUserID         *int64
	CreatedByUserID   *int64
	UpdatedByUserID   *int64
}

type officialReceiptStatusRow struct {
	ReceiptID     int64   `json:"receipt_id"`
	DateNoDisplay string  `json:"date_no_display"`
	CustomerName  string  `json:"customer_name"`
	Amount        float64 `json:"amount"`
	Remark        string  `json:"remark"`
}

func parseOfficialReceiptStatusFilters(r *http.Request) (officialReceiptStatusFilters, map[string]string) {
	dr, errs := parseDateRangeFilters(r)
	if errs != nil {
		return officialReceiptStatusFilters{}, errs
	}
	f := officialReceiptStatusFilters{DateFrom: dr.DateFrom, DateTo: dr.DateTo}
	if id, ok := optionalInt64Query(r, "partner_id"); ok {
		f.PartnerID = id
	}
	if id, ok := optionalInt64Query(r, "location_id"); ok {
		f.LocationID = id
	}
	if id, ok := optionalInt64Query(r, "department_id"); ok {
		f.DepartmentID = id
	}
	if id, ok := optionalInt64Query(r, "project_id"); ok {
		f.ProjectID = id
	}
	if id, ok := optionalInt64Query(r, "pic_user_id"); ok {
		f.PicUserID = id
	}
	if id, ok := optionalInt64Query(r, "created_by_user_id"); ok {
		f.CreatedByUserID = id
	}
	if id, ok := optionalInt64Query(r, "updated_by_user_id"); ok {
		f.UpdatedByUserID = id
	}
	return f, nil
}

func parseDateRangeFilters(r *http.Request) (dateRangeFilters, map[string]string) {
	dr, errs := parseSalesStatusDateRange(r)
	if errs != nil {
		return dateRangeFilters{}, errs
	}
	return dr, nil
}

// parseSalesStatusDateRange mirrors sales status required date range.
func parseSalesStatusDateRange(r *http.Request) (dateRangeFilters, map[string]string) {
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	errs := map[string]string{}
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

type dateRangeFilters struct {
	DateFrom time.Time
	DateTo   time.Time
}

func buildOfficialReceiptStatusWhere(f officialReceiptStatusFilters, tenantID int64) (string, []any) {
	where := `r.tenant_id = $1 and r.deleted_at is null`
	args := []any{tenantID}
	n := 2
	where += fmt.Sprintf(" and r.receipt_date >= $%d::date and r.receipt_date <= $%d::date", n, n+1)
	args = append(args, f.DateFrom, f.DateTo)
	n += 2
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and r.partner_id = $%d", n)
		args = append(args, *f.PartnerID)
		n++
	}
	if f.LocationID != nil {
		where += fmt.Sprintf(" and r.location_id = $%d", n)
		args = append(args, *f.LocationID)
		n++
	}
	if f.DepartmentID != nil {
		where += fmt.Sprintf(" and r.department_id = $%d", n)
		args = append(args, *f.DepartmentID)
		n++
	}
	if f.ProjectID != nil {
		where += fmt.Sprintf(" and r.project_id = $%d", n)
		args = append(args, *f.ProjectID)
		n++
	}
	if f.PicUserID != nil {
		where += fmt.Sprintf(" and r.pic_user_id = $%d", n)
		args = append(args, *f.PicUserID)
		n++
	}
	if f.CreatedByUserID != nil {
		where += fmt.Sprintf(" and r.created_by_user_id = $%d", n)
		args = append(args, *f.CreatedByUserID)
		n++
	}
	if f.UpdatedByUserID != nil {
		where += fmt.Sprintf(" and r.updated_by_user_id = $%d", n)
		args = append(args, *f.UpdatedByUserID)
		n++
	}
	return where, args
}

func officialReceiptStatusFromClause() string {
	return `
		from public.fin_official_receipts r
		join public.inv_partners p on p.id = r.partner_id
		left join lateral (
		  select string_agg(distinct left(coalesce(ln.remark, ln.item_name), 80), '; ' order by left(coalesce(ln.remark, ln.item_name), 80)) as app_remarks
		  from public.fin_receipt_applications a
		  join public.sa_sales s on s.id = a.sales_id
		  join public.sa_sales_lines ln on ln.sales_id = s.id
		  where a.official_receipt_id = r.id
		  limit 3
		) ar on true`
}

func queryOfficialReceiptStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f officialReceiptStatusFilters, sort, order string, limit, offset int) ([]officialReceiptStatusRow, int64, error) {
	where, args := buildOfficialReceiptStatusWhere(f, tenantID)
	allowed := map[string]string{
		"receipt_date":  "r.receipt_date",
		"customer_name": "p.company_name",
		"amount":        "r.amount_total",
	}
	col := allowed["receipt_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	q := fmt.Sprintf(`
		select r.id, r.receipt_date, r.date_seq, p.company_name, r.amount_total::float8,
		  coalesce(nullif(btrim(r.remark), ''), nullif(btrim(r.notes), ''), coalesce(ar.app_remarks, '')),
		  count(*) over()
		%s
		where %s
		order by %s %s, r.id desc
		limit $%d offset $%d`,
		officialReceiptStatusFromClause(), where, col, orderSQL(order), len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []officialReceiptStatusRow
	var total int64
	for rows.Next() {
		var row officialReceiptStatusRow
		var receiptDate time.Time
		var dateSeq int
		var remark string
		if err := rows.Scan(&row.ReceiptID, &receiptDate, &dateSeq, &row.CustomerName, &row.Amount, &remark, &total); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(receiptDate, dateSeq)
		row.Remark = remark
		out = append(out, row)
	}
	if out == nil {
		out = []officialReceiptStatusRow{}
	}
	return out, total, nil
}

func listOfficialReceiptStatus(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"receipt_date":  "r.receipt_date",
		"customer_name": "p.company_name",
		"amount":        "r.amount_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseOfficialReceiptStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "receipt_date", allowed)
		offset := httputil.Offset(p)
		sortKey := strings.TrimSpace(r.URL.Query().Get("sort"))
		if sortKey == "" {
			sortKey = "receipt_date"
		}
		rows, total, err := queryOfficialReceiptStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load official receipt status.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, rows, p.Page, p.PageSize, total)
	}
}

func exportOfficialReceiptStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseOfficialReceiptStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryOfficialReceiptStatusRows(r.Context(), pool, tu.TenantID, f, "receipt_date", "desc", reportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export official receipt status.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="official-receipt-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date-No.", "Customer/Vendor Name", "Amount", "Remark"})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.DateNoDisplay,
				row.CustomerName,
				fmt.Sprintf("%.2f", row.Amount),
				row.Remark,
			})
		}
		cw.Flush()
	}
}

