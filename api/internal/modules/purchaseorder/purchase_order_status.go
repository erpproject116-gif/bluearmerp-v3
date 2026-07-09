package purchaseorder

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

const poStatusReportExportMaxRows = 5000

type purchaseOrderStatusFilters struct {
	dateRangeFilters
	LocationID     *int64
	ProjectID      *int64
	PicUserID      *int64
	PartnerID      *int64
	ItemID         *int64
	TaxTypeID      *int64
	ProgressStatus string
	Status         string
}

type purchaseOrderStatusRow struct {
	PurchaseOrderID int64   `json:"purchase_order_id"`
	LineID          int64   `json:"line_id"`
	DateNoDisplay   string  `json:"date_no_display"`
	PurchaseOrderNo string  `json:"purchase_order_no"`
	ProgressStatus  string  `json:"progress_status"`
	Status          string  `json:"status"`
	LocationName    string  `json:"location_name"`
	PicName         string  `json:"pic_name"`
	VendorName      string  `json:"vendor_name"`
	TaxTypeName     string  `json:"tax_type_name"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Qty             float64 `json:"qty"`
	ReceivedQty     float64 `json:"received_qty"`
	LineTotal       float64 `json:"line_total"`
	Remark          *string `json:"remark,omitempty"`
}

type purchaseOrderStatusSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type purchaseOrderStatusPayload struct {
	Rows    []purchaseOrderStatusRow   `json:"rows"`
	Summary purchaseOrderStatusSummary `json:"summary"`
}

type dateRangeFilters struct {
	DateFrom time.Time
	DateTo   time.Time
}

func parsePODateRangeFilters(r *http.Request) (dateRangeFilters, map[string]string) {
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

func parsePurchaseOrderStatusFilters(r *http.Request, tu auth.TenantUser) (purchaseOrderStatusFilters, map[string]string) {
	dr, errs := parsePODateRangeFilters(r)
	if errs != nil {
		return purchaseOrderStatusFilters{}, errs
	}
	f := purchaseOrderStatusFilters{dateRangeFilters: dr}
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
	if progress == "unconfirmed" || progress == "e_approval" || progress == "completed" {
		f.ProgressStatus = progress
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if isValidPOStatus(status) {
		f.Status = status
	}
	f.LocationID = datascope.ResolveLocationFilter(tu, f.LocationID)
	return f, nil
}

func buildPurchaseOrderStatusWhere(f purchaseOrderStatusFilters, tenantID int64) (string, []any) {
	where := `po.tenant_id = $1 and po.deleted_at is null
		and po.order_date >= $2::date and po.order_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and po.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.ProjectID != nil {
		where += fmt.Sprintf(" and po.project_id = $%d", argN)
		args = append(args, *f.ProjectID)
		argN++
	}
	if f.PicUserID != nil {
		where += fmt.Sprintf(" and po.pic_user_id = $%d", argN)
		args = append(args, *f.PicUserID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and po.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.TaxTypeID != nil {
		where += fmt.Sprintf(" and po.tax_type_id = $%d", argN)
		args = append(args, *f.TaxTypeID)
		argN++
	}
	if f.ProgressStatus != "" {
		where += fmt.Sprintf(" and po.progress_status = $%d", argN)
		args = append(args, f.ProgressStatus)
		argN++
	}
	if f.Status != "" {
		where += fmt.Sprintf(" and po.status = $%d", argN)
		args = append(args, f.Status)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and ln.item_id = $%d", argN)
		args = append(args, *f.ItemID)
		argN++
	}
	return where, args
}

func purchaseOrderStatusFromClause() string {
	return `
		from public.po_purchase_orders po
		join public.inv_locations l on l.id = po.location_id
		left join public.inv_partners p on p.id = po.partner_id
		join public.quo_tax_types tt on tt.id = po.tax_type_id
		join public.po_purchase_order_lines ln on ln.purchase_order_id = po.id`
}

func purchaseOrderStatusOrderBy(sort, order string) string {
	allowed := map[string]string{
		"order_date":        "po.order_date",
		"purchase_order_no": "po.purchase_order_no",
		"progress_status":   "po.progress_status",
		"status":            "po.status",
		"location_name":     "l.location_name",
		"pic_name":          "po.pic_name",
		"vendor_name":       "coalesce(p.company_name, ln.partner_name)",
		"item_code":         "ln.item_code",
		"qty":               "ln.qty",
		"line_total":        "ln.line_total",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	return fmt.Sprintf("%s %s, ln.line_no asc", col, orderSQL(order))
}

func queryPurchaseOrderStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f purchaseOrderStatusFilters, sort, order string, limit, offset int) ([]purchaseOrderStatusRow, int64, error) {
	where, args := buildPurchaseOrderStatusWhere(f, tenantID)
	orderClause := purchaseOrderStatusOrderBy(sort, order)
	q := fmt.Sprintf(`
		select po.id, ln.id, po.order_date, po.date_seq, po.purchase_order_no, po.progress_status, po.status,
		  l.location_name, po.pic_name, coalesce(p.company_name, ln.partner_name, ''), tt.name,
		  ln.item_code, ln.item_name, ln.qty::float8, ln.received_qty::float8, ln.line_total::float8, ln.remark,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		purchaseOrderStatusFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []purchaseOrderStatusRow
	var total int64
	for rows.Next() {
		var row purchaseOrderStatusRow
		var orderDate time.Time
		var dateSeq int
		if err := rows.Scan(
			&row.PurchaseOrderID, &row.LineID, &orderDate, &dateSeq, &row.PurchaseOrderNo, &row.ProgressStatus, &row.Status,
			&row.LocationName, &row.PicName, &row.VendorName, &row.TaxTypeName,
			&row.ItemCode, &row.ItemName, &row.Qty, &row.ReceivedQty, &row.LineTotal, &row.Remark, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		out = append(out, row)
	}
	if out == nil {
		out = []purchaseOrderStatusRow{}
	}
	return out, total, nil
}

func queryPurchaseOrderStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f purchaseOrderStatusFilters) (purchaseOrderStatusSummary, error) {
	where, args := buildPurchaseOrderStatusWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.line_total), 0)::float8 %s where %s`,
		purchaseOrderStatusFromClause(), where)
	var summary purchaseOrderStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalAmount)
	return summary, err
}

func listPurchaseOrderStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":        "po.order_date",
		"purchase_order_no": "po.purchase_order_no",
		"progress_status":   "po.progress_status",
		"status":            "po.status",
		"location_name":     "l.location_name",
		"pic_name":          "po.pic_name",
		"vendor_name":       "coalesce(p.company_name, ln.partner_name)",
		"item_code":         "ln.item_code",
		"qty":               "ln.qty",
		"line_total":        "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePurchaseOrderStatusFilters(r, tu)
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

		rows, total, err := queryPurchaseOrderStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase order status.", "ERR_INTERNAL")
			return
		}
		summary, err := queryPurchaseOrderStatusSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase order summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: purchaseOrderStatusPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportPurchaseOrderStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePurchaseOrderStatusFilters(r, tu)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryPurchaseOrderStatusRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", poStatusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export purchase order status.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="purchase-order-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "PO No", "Progress", "Status", "Location", "PIC", "Vendor", "Tax Type",
			"Item Code", "Item Name", "Qty", "Received Qty", "Line Total", "Remark",
		})
		for _, row := range rows {
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.PurchaseOrderNo, formatPOProgressLabel(row.ProgressStatus), row.Status,
				row.LocationName, row.PicName, row.VendorName, row.TaxTypeName,
				row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.ReceivedQty, 'f', -1, 64),
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
				remark,
			})
		}
		cw.Flush()
	}
}

func formatPOProgressLabel(s string) string {
	switch s {
	case "e_approval":
		return "E-Approval"
	case "completed":
		return "Completed"
	default:
		return "Unconfirmed"
	}
}
