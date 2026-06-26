package sales

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

type discountStatusRow struct {
	SalesID        int64   `json:"sales_id"`
	LineID         int64   `json:"line_id"`
	DateNoDisplay  string  `json:"date_no_display"`
	SalesNo        string  `json:"sales_no"`
	CustomerName   string  `json:"customer_name"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Qty            float64 `json:"qty"`
	DiscountAmount float64 `json:"discount_amount"`
	LineTotal      float64 `json:"line_total"`
	Remark         *string `json:"remark,omitempty"`
	LocationName   string  `json:"location_name"`
	DepartmentName string  `json:"department_name,omitempty"`
}

type discountStatusSummary struct {
	TotalQty            float64 `json:"total_qty"`
	TotalDiscountAmount float64 `json:"total_discount_amount"`
	TotalAmount         float64 `json:"total_amount"`
}

type discountStatusPayload struct {
	Rows    []discountStatusRow   `json:"rows"`
	Summary discountStatusSummary `json:"summary"`
}

func discountStatusFromClause() string {
	return `
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		join public.inv_locations l on l.id = s.location_id
		left join public.inv_departments dept on dept.id = s.department_id
		join public.sa_sales_lines ln on ln.sales_id = s.id`
}

func buildDiscountStatusWhere(f salesStatusFilters, tenantID int64) (string, []any) {
	where, args := buildSalesStatusWhere(f, tenantID)
	where += " and ln.discount_amount > 0"
	return where, args
}

func queryDiscountStatusRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f salesStatusFilters, sort, order string, limit, offset int) ([]discountStatusRow, int64, error) {
	where, args := buildDiscountStatusWhere(f, tenantID)
	orderClause := salesStatusOrderBy(sort, order)
	q := fmt.Sprintf(`
		select s.id, ln.id, s.order_date, s.date_seq, s.sales_no, p.company_name,
		  ln.item_code, ln.item_name, ln.qty::float8, ln.discount_amount::float8, ln.line_total::float8, ln.remark,
		  l.location_name, coalesce(dept.name, ''),
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
			&row.SalesID, &row.LineID, &orderDate, &dateSeq, &row.SalesNo, &row.CustomerName,
			&row.ItemCode, &row.ItemName, &row.Qty, &row.DiscountAmount, &row.LineTotal, &row.Remark,
			&row.LocationName, &row.DepartmentName, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		out = append(out, row)
	}
	if out == nil {
		out = []discountStatusRow{}
	}
	return out, total, nil
}

func queryDiscountStatusSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f salesStatusFilters) (discountStatusSummary, error) {
	where, args := buildDiscountStatusWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.discount_amount), 0)::float8, coalesce(sum(ln.line_total), 0)::float8 %s where %s`,
		discountStatusFromClause(), where)
	var summary discountStatusSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalDiscountAmount, &summary.TotalAmount)
	return summary, err
}

func listDiscountStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":      "s.order_date",
		"sales_no":        "s.sales_no",
		"customer_name":   "p.company_name",
		"item_code":       "ln.item_code",
		"discount_amount": "ln.discount_amount",
		"line_total":      "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseSalesStatusFilters(r)
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
		rows, total, err := queryDiscountStatusRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
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
			Data: discountStatusPayload{Rows: rows, Summary: summary},
			Meta:    &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportDiscountStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseSalesStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryDiscountStatusRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export discount status.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="sales-discount-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date-No.", "Sales No.", "Customer", "Item Code", "Item Name", "Qty", "Discount Amount", "Line Total", "Remark", "Location", "Department"})
		for _, row := range rows {
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.SalesNo, row.CustomerName, row.ItemCode, row.ItemName,
				fmt.Sprintf("%.4f", row.Qty), fmt.Sprintf("%.4f", row.DiscountAmount), fmt.Sprintf("%.4f", row.LineTotal),
				remark, row.LocationName, row.DepartmentName,
			})
		}
		cw.Flush()
	}
}
