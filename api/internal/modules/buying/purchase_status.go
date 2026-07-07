package buying

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

const purchaseStatusExportMax = 5000

type purchaseStatusFilters struct {
	DateFrom       time.Time
	DateTo         time.Time
	PartnerID      *int64
	ItemID         *int64
	ProgressStatus string
	ReportType     string
}

type purchaseStatusRow struct {
	SupplierInvoiceID int64   `json:"supplier_invoice_id"`
	LineID            int64   `json:"line_id,omitempty"`
	DateNoDisplay     string  `json:"date_no_display"`
	InvoiceNo         string  `json:"invoice_no"`
	ProgressStatus    string  `json:"progress_status"`
	VendorName        string  `json:"vendor_name"`
	ItemCode          string  `json:"item_code"`
	ItemName          string  `json:"item_name"`
	Qty               float64 `json:"qty"`
	LineTotal         float64 `json:"line_total"`
	Remark            *string `json:"remark,omitempty"`
}

type purchaseStatusSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type purchaseStatusPayload struct {
	Rows    []purchaseStatusRow   `json:"rows"`
	Summary purchaseStatusSummary `json:"summary"`
}

func parsePurchaseStatusFilters(r *http.Request) (purchaseStatusFilters, map[string]string) {
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
		return purchaseStatusFilters{}, errs
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
		return purchaseStatusFilters{}, errs
	}
	if from.After(to) {
		errs["date_to"] = "End date must be on or after start date."
		return purchaseStatusFilters{}, errs
	}
	f := purchaseStatusFilters{DateFrom: from, DateTo: to}
	if id, ok := optionalInt64Query(r, "partner_id"); ok {
		f.PartnerID = id
	}
	if id, ok := optionalInt64Query(r, "item_id"); ok {
		f.ItemID = id
	}
	progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
	if progress == "unconfirmed" || progress == "completed" || progress == "e_approval" {
		f.ProgressStatus = progress
	}
	rt := strings.TrimSpace(r.URL.Query().Get("report_type"))
	switch rt {
	case "summary", "by_line":
		f.ReportType = rt
	default:
		f.ReportType = "details"
	}
	return f, nil
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

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func formatDateNoDisplay(d time.Time, dateSeq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d", d.Month(), d.Day(), d.Year(), dateSeq)
}

func purchaseStatusWhere(f purchaseStatusFilters, tenantID int64) (string, []any) {
	where := `si.tenant_id = $1 and si.deleted_at is null
		and si.invoice_date >= $2::date and si.invoice_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and si.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.ProgressStatus != "" {
		where += fmt.Sprintf(" and si.progress_status = $%d", argN)
		args = append(args, f.ProgressStatus)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and ln.item_id = $%d", argN)
		args = append(args, *f.ItemID)
	}
	return where, args
}

func purchaseStatusFromClause(f purchaseStatusFilters) string {
	switch f.ReportType {
	case "summary":
		return `
		from public.fin_supplier_invoices si
		join public.inv_partners p on p.id = si.partner_id
		join public.fin_supplier_invoice_lines ln on ln.supplier_invoice_id = si.id`
	case "by_line":
		return `
		from public.fin_supplier_invoices si
		join public.fin_supplier_invoice_lines ln on ln.supplier_invoice_id = si.id`
	default:
		return `
		from public.fin_supplier_invoices si
		join public.inv_partners p on p.id = si.partner_id
		join public.fin_supplier_invoice_lines ln on ln.supplier_invoice_id = si.id`
	}
}

func purchaseStatusSelect(f purchaseStatusFilters) string {
	switch f.ReportType {
	case "summary":
		return `select si.id, 0::bigint, si.invoice_date, si.date_seq, si.invoice_no, si.progress_status,
		  p.company_name, ''::varchar, '(summary)'::text, coalesce(sum(ln.qty), 0)::float8,
		  coalesce(sum(ln.line_total), 0)::float8, si.invoice_remark`
	case "by_line":
		return `select 0::bigint, 0::bigint, min(si.invoice_date), 0, '—'::varchar, ''::varchar,
		  '—'::text, ln.item_code, ln.item_name, coalesce(sum(ln.qty), 0)::float8,
		  coalesce(sum(ln.line_total), 0)::float8, null::text`
	default:
		return `select si.id, ln.id, si.invoice_date, si.date_seq, si.invoice_no, si.progress_status,
		  p.company_name, ln.item_code, ln.item_name, ln.qty::float8, ln.line_total::float8,
		  si.invoice_remark`
	}
}

func purchaseStatusGroupBy(f purchaseStatusFilters) string {
	switch f.ReportType {
	case "summary":
		return ` group by si.id, si.invoice_date, si.date_seq, si.invoice_no, si.progress_status,
		  p.company_name, si.invoice_remark`
	case "by_line":
		return ` group by ln.item_id, ln.item_code, ln.item_name`
	default:
		return ""
	}
}

func purchaseStatusOrderBy(f purchaseStatusFilters) string {
	switch f.ReportType {
	case "by_line":
		return "item_code asc"
	default:
		return "invoice_date desc, invoice_no asc, line_id asc"
	}
}

func queryPurchaseStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f purchaseStatusFilters, limit, offset int) ([]purchaseStatusRow, int64, error) {
	where, args := purchaseStatusWhere(f, tenantID)
	q := fmt.Sprintf(`%s %s where %s%s order by %s limit $%d offset $%d`,
		purchaseStatusSelect(f), purchaseStatusFromClause(f), where, purchaseStatusGroupBy(f),
		purchaseStatusOrderBy(f), len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []purchaseStatusRow
	for rows.Next() {
		var row purchaseStatusRow
		var invoiceDate time.Time
		var dateSeq int
		var remark *string
		if err := rows.Scan(
			&row.SupplierInvoiceID, &row.LineID, &invoiceDate, &dateSeq, &row.InvoiceNo, &row.ProgressStatus,
			&row.VendorName, &row.ItemCode, &row.ItemName, &row.Qty, &row.LineTotal, &remark,
		); err != nil {
			return nil, 0, err
		}
		if f.ReportType != "by_line" {
			row.DateNoDisplay = formatDateNoDisplay(invoiceDate, dateSeq)
		} else {
			row.DateNoDisplay = "—"
		}
		row.Remark = remark
		out = append(out, row)
	}

	countQ := fmt.Sprintf(`select count(*) from (select 1 %s where %s%s) sub`,
		purchaseStatusFromClause(f), where, purchaseStatusGroupBy(f))
	var total int64
	if err := pool.QueryRow(ctx, countQ, args[:len(args)-2]...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if out == nil {
		out = []purchaseStatusRow{}
	}
	return out, total, nil
}

func queryPurchaseStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f purchaseStatusFilters) (purchaseStatusSummary, error) {
	where, args := purchaseStatusWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.line_total), 0)::float8
		from public.fin_supplier_invoices si
		join public.fin_supplier_invoice_lines ln on ln.supplier_invoice_id = si.id
		where %s`, where)
	var summary purchaseStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalAmount)
	return summary, err
}

func listPurchaseStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePurchaseStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "invoice_date", map[string]string{"invoice_date": "si.invoice_date"})
		offset := httputil.Offset(p)

		rows, total, err := queryPurchaseStatusRows(r.Context(), pool, tu.TenantID, f, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase status.", "ERR_INTERNAL")
			return
		}
		summary, err := queryPurchaseStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase summary.", "ERR_INTERNAL")
			return
		}
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data:    purchaseStatusPayload{Rows: rows, Summary: summary},
			Meta:    &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportPurchaseStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePurchaseStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryPurchaseStatusRows(r.Context(), pool, tu.TenantID, f, purchaseStatusExportMax, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export purchase status.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="purchase-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date-No", "Invoice No", "Progress", "Vendor", "Item Code", "Item Name", "Qty", "Line Total", "Remark"})
		for _, row := range rows {
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.InvoiceNo, row.ProgressStatus, row.VendorName,
				row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
				remark,
			})
		}
		cw.Flush()
	}
}
