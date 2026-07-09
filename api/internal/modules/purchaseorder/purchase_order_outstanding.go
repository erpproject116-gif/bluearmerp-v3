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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type poOutstandingFilters struct {
	purchaseOrderStatusFilters
	MinBalanceQty float64
}

type poOutstandingRow struct {
	PurchaseOrderID int64   `json:"purchase_order_id"`
	LineID          int64   `json:"line_id"`
	DateNoDisplay   string  `json:"date_no_display"`
	PurchaseOrderNo string  `json:"purchase_order_no"`
	ProgressStatus  string  `json:"progress_status"`
	Status          string  `json:"status"`
	VendorName      string  `json:"vendor_name"`
	LocationName    string  `json:"location_name"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Qty             float64 `json:"qty"`
	BalanceQty      float64 `json:"balance_qty"`
	LineTotal       float64 `json:"line_total"`
}

type poOutstandingSummary struct {
	TotalBalanceQty float64 `json:"total_balance_qty"`
	TotalAmount     float64 `json:"total_amount"`
}

type poOutstandingPayload struct {
	Rows    []poOutstandingRow   `json:"rows"`
	Summary poOutstandingSummary `json:"summary"`
}

func parsePOOutstandingFilters(r *http.Request, tu auth.TenantUser) (poOutstandingFilters, map[string]string) {
	base, errs := parsePurchaseOrderStatusFilters(r, tu)
	if errs != nil {
		return poOutstandingFilters{}, errs
	}
	f := poOutstandingFilters{
		purchaseOrderStatusFilters: base,
		MinBalanceQty:              0.0001,
	}
	if s := strings.TrimSpace(r.URL.Query().Get("min_balance_qty")); s != "" {
		if n, err := strconv.ParseFloat(s, 64); err == nil && n >= 0 {
			f.MinBalanceQty = n
		}
	}
	return f, nil
}

func poOutstandingFromClause() string {
	return `
		from public.po_purchase_orders po
		join public.inv_locations l on l.id = po.location_id
		left join public.inv_partners p on p.id = po.partner_id
		join public.po_purchase_order_lines ln on ln.purchase_order_id = po.id`
}

func buildPOOutstandingWhere(f poOutstandingFilters, tenantID int64) (string, []any) {
	where, args := buildPurchaseOrderStatusWhere(f.purchaseOrderStatusFilters, tenantID)
	argN := len(args) + 1
	where += fmt.Sprintf(` and po.status in ('confirmed', 'partially_received')
		and (ln.qty - ln.received_qty) > $%d`, argN)
	args = append(args, f.MinBalanceQty)
	return where, args
}

func poOutstandingOrderBy(sort, order string) string {
	allowed := map[string]string{
		"order_date":        "po.order_date",
		"purchase_order_no": "po.purchase_order_no",
		"vendor_name":       "coalesce(p.company_name, ln.partner_name)",
		"item_code":         "ln.item_code",
		"balance_qty":       "(ln.qty - ln.received_qty)",
		"line_total":        "ln.line_total",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	return fmt.Sprintf("%s %s, ln.line_no asc", col, orderSQL(order))
}

func queryPOOutstandingRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f poOutstandingFilters, sort, order string, limit, offset int) ([]poOutstandingRow, int64, error) {
	where, args := buildPOOutstandingWhere(f, tenantID)
	orderClause := poOutstandingOrderBy(sort, order)
	q := fmt.Sprintf(`
		select po.id, ln.id, po.order_date, po.date_seq, po.purchase_order_no, po.progress_status, po.status,
		  coalesce(p.company_name, ln.partner_name, ''), l.location_name,
		  ln.item_code, ln.item_name, ln.qty::float8,
		  (ln.qty - ln.received_qty)::float8, ln.line_total::float8,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		poOutstandingFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []poOutstandingRow
	var total int64
	for rows.Next() {
		var row poOutstandingRow
		var orderDate time.Time
		var dateSeq int
		if err := rows.Scan(
			&row.PurchaseOrderID, &row.LineID, &orderDate, &dateSeq, &row.PurchaseOrderNo, &row.ProgressStatus, &row.Status,
			&row.VendorName, &row.LocationName,
			&row.ItemCode, &row.ItemName, &row.Qty, &row.BalanceQty, &row.LineTotal, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		out = append(out, row)
	}
	if out == nil {
		out = []poOutstandingRow{}
	}
	return out, total, nil
}

func queryPOOutstandingSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f poOutstandingFilters) (poOutstandingSummary, error) {
	where, args := buildPOOutstandingWhere(f, tenantID)
	q := fmt.Sprintf(`
		select coalesce(sum(ln.qty - ln.received_qty), 0)::float8,
		       coalesce(sum(ln.line_total), 0)::float8
		%s where %s`, poOutstandingFromClause(), where)
	var summary poOutstandingSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalBalanceQty, &summary.TotalAmount)
	return summary, err
}

func listPurchaseOrderOutstandingReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":        "po.order_date",
		"purchase_order_no": "po.purchase_order_no",
		"vendor_name":       "coalesce(p.company_name, ln.partner_name)",
		"item_code":         "ln.item_code",
		"balance_qty":       "(ln.qty - ln.received_qty)",
		"line_total":        "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePOOutstandingFilters(r, tu)
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

		rows, total, err := queryPOOutstandingRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load outstanding PO report.", "ERR_INTERNAL")
			return
		}
		summary, err := queryPOOutstandingSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load outstanding PO summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: poOutstandingPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportPurchaseOrderOutstandingReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePOOutstandingFilters(r, tu)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryPOOutstandingRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", poStatusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export outstanding PO report.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="purchase-order-outstanding.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "PO No", "Progress", "Status", "Vendor", "Location",
			"Item Code", "Item Name", "Qty", "Balance Qty", "Line Total",
		})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.DateNoDisplay, row.PurchaseOrderNo, formatPOProgressLabel(row.ProgressStatus), row.Status,
				row.VendorName, row.LocationName, row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.BalanceQty, 'f', -1, 64),
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
			})
		}
		cw.Flush()
	}
}
