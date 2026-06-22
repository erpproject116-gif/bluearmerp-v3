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

type outstandingFilters struct {
	quotationStatusFilters
	MinBalanceQty float64
	RequireStock  bool
	StockBasis    string
}

type outstandingRow struct {
	QuotationID    int64   `json:"quotation_id"`
	LineID         int64   `json:"line_id"`
	DateNoDisplay  string  `json:"date_no_display"`
	ReferenceNo    string  `json:"reference_no"`
	ProgressStatus string  `json:"progress_status"`
	CustomerName   string  `json:"customer_name"`
	LocationName   string  `json:"location_name"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Qty            float64 `json:"qty"`
	BalanceQty     float64 `json:"balance_qty"`
	LocationStock  float64 `json:"location_stock"`
	TotalStock     float64 `json:"total_stock"`
	ValidUntil     *string `json:"valid_until,omitempty"`
	LineTotal      float64 `json:"line_total"`
}

type outstandingSummary struct {
	TotalBalanceQty float64 `json:"total_balance_qty"`
	TotalAmount     float64 `json:"total_amount"`
}

type outstandingPayload struct {
	Rows    []outstandingRow   `json:"rows"`
	Summary outstandingSummary `json:"summary"`
}

func parseOutstandingFilters(r *http.Request) (outstandingFilters, map[string]string) {
	base, errs := parseQuotationStatusFilters(r)
	if errs != nil {
		return outstandingFilters{}, errs
	}
	f := outstandingFilters{
		quotationStatusFilters: base,
		MinBalanceQty:          0.0001,
		RequireStock:           true,
		StockBasis:             "location_out",
	}
	if base.Validity == "" {
		f.Validity = "active"
	}
	if s := strings.TrimSpace(r.URL.Query().Get("min_balance_qty")); s != "" {
		if n, err := strconv.ParseFloat(s, 64); err == nil && n >= 0 {
			f.MinBalanceQty = n
		}
	}
	if s := strings.TrimSpace(r.URL.Query().Get("require_stock")); s == "false" || s == "0" {
		f.RequireStock = false
	}
	if basis := strings.TrimSpace(r.URL.Query().Get("stock_basis")); basis == "total" || basis == "location_out" {
		f.StockBasis = basis
	}
	return f, nil
}

func outstandingFromClause() string {
	return `
		from public.quo_quotations q
		join public.inv_partners p on p.id = q.partner_id
		join public.inv_locations l on l.id = q.location_id
		join public.quo_quotation_lines ln on ln.quotation_id = q.id
		left join public.inv_items i on i.id = ln.item_id
		left join (
		  select quotation_line_id, sum(qty) as qty_fulfilled
		  from public.quo_quotation_slip_lines
		  group by quotation_line_id
		) slip on slip.quotation_line_id = ln.id
		left join public.inv_item_location_balances bal
		  on bal.tenant_id = q.tenant_id and bal.item_id = ln.item_id and bal.location_id = q.location_id
		left join (
		  select tenant_id, item_id, sum(qty_on_hand) as total_qty
		  from public.inv_item_location_balances
		  group by tenant_id, item_id
		) tot on tot.tenant_id = q.tenant_id and tot.item_id = ln.item_id`
}

func buildOutstandingWhere(f outstandingFilters, tenantID int64) (string, []any) {
	where, args := buildQuotationStatusWhere(f.quotationStatusFilters, tenantID)
	argN := len(args) + 1
	where += fmt.Sprintf(` and (ln.qty - coalesce(slip.qty_fulfilled, 0)) > $%d`, argN)
	args = append(args, f.MinBalanceQty)
	if f.RequireStock {
		if f.StockBasis == "total" {
			where += ` and (coalesce(i.track_inventory_qty, false) = false
				or coalesce(tot.total_qty, 0) >= (ln.qty - coalesce(slip.qty_fulfilled, 0)))`
		} else {
			where += ` and (coalesce(i.track_inventory_qty, false) = false
				or coalesce(bal.qty_on_hand, 0) >= (ln.qty - coalesce(slip.qty_fulfilled, 0)))`
		}
	}
	return where, args
}

func outstandingOrderBy(sort, order string) string {
	allowed := map[string]string{
		"order_date":    "q.order_date",
		"reference_no":  "q.reference_no",
		"customer_name": "p.company_name",
		"item_code":     "ln.item_code",
		"balance_qty":   "(ln.qty - coalesce(slip.qty_fulfilled, 0))",
		"valid_until":   "q.valid_until",
		"line_total":    "ln.line_total",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	return fmt.Sprintf("%s %s, ln.line_no asc", col, orderSQL(order))
}

func queryOutstandingRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f outstandingFilters, sort, order string, limit, offset int) ([]outstandingRow, int64, error) {
	where, args := buildOutstandingWhere(f, tenantID)
	orderClause := outstandingOrderBy(sort, order)
	q := fmt.Sprintf(`
		select q.id, ln.id, q.order_date, q.date_seq, q.reference_no, q.progress_status,
		  p.company_name, l.location_name, ln.item_code, ln.item_name,
		  ln.qty::float8,
		  (ln.qty - coalesce(slip.qty_fulfilled, 0))::float8,
		  coalesce(bal.qty_on_hand, 0)::float8,
		  coalesce(tot.total_qty, 0)::float8,
		  q.valid_until, ln.line_total::float8,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		outstandingFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []outstandingRow
	var total int64
	for rows.Next() {
		var row outstandingRow
		var orderDate time.Time
		var dateSeq int
		var validUntil *time.Time
		if err := rows.Scan(
			&row.QuotationID, &row.LineID, &orderDate, &dateSeq, &row.ReferenceNo, &row.ProgressStatus,
			&row.CustomerName, &row.LocationName, &row.ItemCode, &row.ItemName,
			&row.Qty, &row.BalanceQty, &row.LocationStock, &row.TotalStock,
			&validUntil, &row.LineTotal, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		row.ValidUntil = datePtrToStr(validUntil)
		out = append(out, row)
	}
	if out == nil {
		out = []outstandingRow{}
	}
	return out, total, nil
}

func queryOutstandingSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f outstandingFilters) (outstandingSummary, error) {
	where, args := buildOutstandingWhere(f, tenantID)
	q := fmt.Sprintf(`
		select coalesce(sum(ln.qty - coalesce(slip.qty_fulfilled, 0)), 0)::float8,
		       coalesce(sum(ln.line_total), 0)::float8
		%s where %s`, outstandingFromClause(), where)
	var summary outstandingSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalBalanceQty, &summary.TotalAmount)
	return summary, err
}

func listOutstandingReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":    "q.order_date",
		"reference_no":  "q.reference_no",
		"customer_name": "p.company_name",
		"item_code":     "ln.item_code",
		"balance_qty":   "(ln.qty - coalesce(slip.qty_fulfilled, 0))",
		"valid_until":   "q.valid_until",
		"line_total":    "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseOutstandingFilters(r)
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

		rows, total, err := queryOutstandingRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load outstanding report.", "ERR_INTERNAL")
			return
		}
		summary, err := queryOutstandingSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load outstanding summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: outstandingPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportOutstandingReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseOutstandingFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryOutstandingRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export outstanding report.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="quotation-outstanding.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "Reference No", "Progress Status", "Customer Name", "Location Name",
			"Item Code", "Item Name", "Qty", "Balance Qty", "Location Stock", "Total Stock",
			"Valid Until", "Line Total",
		})
		for _, row := range rows {
			validUntil := ""
			if row.ValidUntil != nil {
				validUntil = *row.ValidUntil
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.ReferenceNo, formatProgressLabel(row.ProgressStatus),
				row.CustomerName, row.LocationName, row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.BalanceQty, 'f', -1, 64),
				strconv.FormatFloat(row.LocationStock, 'f', -1, 64),
				strconv.FormatFloat(row.TotalStock, 'f', -1, 64),
				validUntil,
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
			})
		}
		cw.Flush()
	}
}
