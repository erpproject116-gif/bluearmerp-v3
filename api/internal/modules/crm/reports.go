package crm

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const reportExportMaxRows = 5000

func registerReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/customer-quotations-by-item", listCustomerQuotationsByItem(pool))
	r.Get("/customer-quotations-by-item/export", exportCustomerQuotationsByItem(pool))
	r.Get("/item-demand", listItemDemand(pool))
	r.Get("/item-demand/export", exportItemDemand(pool))
	r.Get("/conversion-funnel", conversionFunnel(pool))
	r.Get("/conversion-funnel/export", exportConversionFunnel(pool))
	r.Get("/low-stock", listLowStock(pool))
	r.Get("/low-stock/export", exportLowStock(pool))
	r.Get("/expired-quotations", listExpiredQuotations(pool))
	r.Get("/expired-quotations/export", exportExpiredQuotations(pool))
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

type customerQuotationsByItemRow struct {
	ItemID        *int64  `json:"item_id,omitempty"`
	ItemCode      string  `json:"item_code"`
	ItemName      string  `json:"item_name"`
	PartnerID     int64   `json:"partner_id"`
	CustomerName  string  `json:"customer_name"`
	QuotationCount int64  `json:"quotation_count"`
	TotalQty      float64 `json:"total_qty"`
	TotalAmount   float64 `json:"total_amount"`
}

func customerQuotationsByItemSQL(tenantID int64, itemID *int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	n := 2
	where := "q.tenant_id = $1 and q.deleted_at is null"
	if itemID != nil {
		where += fmt.Sprintf(" and ln.item_id = $%d", n)
		args = append(args, *itemID)
		n++
	}
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and q.order_date >= $%d::date and q.order_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select ln.item_id, ln.item_code, ln.item_name,
		  q.partner_id, p.company_name,
		  count(distinct q.id)::bigint,
		  coalesce(sum(ln.qty), 0)::float8,
		  coalesce(sum(ln.line_total), 0)::float8
		from public.quo_quotations q
		join public.quo_quotation_lines ln on ln.quotation_id = q.id
		join public.inv_partners p on p.id = q.partner_id
		where %s
		group by ln.item_id, ln.item_code, ln.item_name, q.partner_id, p.company_name`,
		where)
	return q, args
}

func listCustomerQuotationsByItem(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"item_code": "item_code", "customer_name": "customer_name",
		"quotation_count": "quotation_count", "total_qty": "total_qty", "total_amount": "total_amount",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		itemID, _ := optionalInt64Query(r, "item_id")
		p := httputil.ParseListParams(r, "total_qty", allowed)
		offset := httputil.Offset(p)
		base, args := customerQuotationsByItemSQL(tu.TenantID, itemID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d",
			base, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []customerQuotationsByItemRow
		for rows.Next() {
			var row customerQuotationsByItemRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.PartnerID, &row.CustomerName,
				&row.QuotationCount, &row.TotalQty, &row.TotalAmount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []customerQuotationsByItemRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportCustomerQuotationsByItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		itemID, _ := optionalInt64Query(r, "item_id")
		base, args := customerQuotationsByItemSQL(tu.TenantID, itemID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by total_qty desc limit %d", base, reportExportMaxRows)
		writeCustomerQuotationsCSV(w, pool, r.Context(), q, args)
	}
}

func writeCustomerQuotationsCSV(w http.ResponseWriter, pool *pgxpool.Pool, ctx context.Context, q string, args []any) {
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return
	}
	defer rows.Close()
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="customer-quotations-by-item.csv"`)
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"Item Code", "Item Name", "Customer", "Quotation Count", "Total Qty", "Total Amount"})
	for rows.Next() {
		var row customerQuotationsByItemRow
		if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.PartnerID, &row.CustomerName,
			&row.QuotationCount, &row.TotalQty, &row.TotalAmount); err != nil {
			return
		}
		_ = cw.Write([]string{
			row.ItemCode, row.ItemName, row.CustomerName,
			strconv.FormatInt(row.QuotationCount, 10),
			fmt.Sprintf("%.4f", row.TotalQty), fmt.Sprintf("%.4f", row.TotalAmount),
		})
	}
	cw.Flush()
}

type itemDemandRow struct {
	ItemID       *int64  `json:"item_id,omitempty"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	QuotedQty    float64 `json:"quoted_qty"`
	SoldQty      float64 `json:"sold_qty"`
	QuotedAmount float64 `json:"quoted_amount"`
	SoldAmount   float64 `json:"sold_amount"`
}

func itemDemandSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	dateFilterQ := ""
	dateFilterS := ""
	n := 2
	if dateFrom != nil && dateTo != nil {
		dateFilterQ = fmt.Sprintf(" and q.order_date >= $%d::date and q.order_date <= $%d::date", n, n+1)
		dateFilterS = fmt.Sprintf(" and s.order_date >= $%d::date and s.order_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		with quoted as (
		  select ln.item_id, ln.item_code, ln.item_name,
		    sum(ln.qty)::float8 as quoted_qty,
		    sum(ln.line_total)::float8 as quoted_amount
		  from public.quo_quotation_lines ln
		  join public.quo_quotations q on q.id = ln.quotation_id
		  where q.tenant_id = $1 and q.deleted_at is null%s
		  group by ln.item_id, ln.item_code, ln.item_name
		),
		sold as (
		  select ln.item_id, ln.item_code, ln.item_name,
		    sum(ln.qty)::float8 as sold_qty,
		    sum(ln.line_total)::float8 as sold_amount
		  from public.sa_sales_lines ln
		  join public.sa_sales s on s.id = ln.sales_id
		  where s.tenant_id = $1 and s.deleted_at is null%s
		  group by ln.item_id, ln.item_code, ln.item_name
		)
		select coalesce(q.item_id, s.item_id), coalesce(q.item_code, s.item_code), coalesce(q.item_name, s.item_name),
		  coalesce(q.quoted_qty, 0), coalesce(s.sold_qty, 0),
		  coalesce(q.quoted_amount, 0), coalesce(s.sold_amount, 0)
		from quoted q
		full outer join sold s on s.item_id is not distinct from q.item_id`,
		dateFilterQ, dateFilterS)
	return q, args
}

func listItemDemand(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"item_code": "item_code", "quoted_qty": "quoted_qty", "sold_qty": "sold_qty",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		p := httputil.ParseListParams(r, "sold_qty", allowed)
		offset := httputil.Offset(p)
		base, args := itemDemandSQL(tu.TenantID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d",
			base, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []itemDemandRow
		for rows.Next() {
			var row itemDemandRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.QuotedQty, &row.SoldQty, &row.QuotedAmount, &row.SoldAmount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []itemDemandRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportItemDemand(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		base, args := itemDemandSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by sold_qty desc limit %d", base, reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="item-demand.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Item Code", "Item Name", "Quoted Qty", "Sold Qty", "Quoted Amount", "Sold Amount"})
		for rows.Next() {
			var row itemDemandRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.QuotedQty, &row.SoldQty, &row.QuotedAmount, &row.SoldAmount); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.ItemCode, row.ItemName,
				fmt.Sprintf("%.4f", row.QuotedQty), fmt.Sprintf("%.4f", row.SoldQty),
				fmt.Sprintf("%.4f", row.QuotedAmount), fmt.Sprintf("%.4f", row.SoldAmount),
			})
		}
		cw.Flush()
	}
}

type conversionFunnelData struct {
	Quotations      int64 `json:"quotations"`
	SalesOrders     int64 `json:"sales_orders"`
	ReleasedLines   int64 `json:"released_lines"`
	Sales           int64 `json:"sales"`
}

func conversionFunnel(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		data, err := queryConversionFunnel(r.Context(), pool, tu.TenantID, dateFrom, dateTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load funnel.", "ERR_INTERNAL")
			return
		}
		response.OK(w, data, "OK")
	}
}

func queryConversionFunnel(ctx context.Context, pool *pgxpool.Pool, tenantID int64, dateFrom, dateTo *time.Time) (conversionFunnelData, error) {
	var d conversionFunnelData
	dateFilter := ""
	args := []any{tenantID}
	if dateFrom != nil && dateTo != nil {
		dateFilter = " and order_date >= $2::date and order_date <= $3::date"
		args = append(args, *dateFrom, *dateTo)
	}
	_ = pool.QueryRow(ctx, fmt.Sprintf(`select count(*) from public.quo_quotations where tenant_id = $1 and deleted_at is null%s`, dateFilter), args...).Scan(&d.Quotations)
	_ = pool.QueryRow(ctx, fmt.Sprintf(`select count(*) from public.so_sales_orders where tenant_id = $1 and deleted_at is null%s`, dateFilter), args...).Scan(&d.SalesOrders)
	_ = pool.QueryRow(ctx, `
		select count(distinct rl.sales_order_line_id) from public.so_sales_order_release_lines rl
		join public.so_sales_order_lines ln on ln.id = rl.sales_order_line_id
		join public.so_sales_orders so on so.id = ln.sales_order_id
		where so.tenant_id = $1 and so.deleted_at is null`, tenantID).Scan(&d.ReleasedLines)
	_ = pool.QueryRow(ctx, fmt.Sprintf(`select count(*) from public.sa_sales where tenant_id = $1 and deleted_at is null%s`, dateFilter), args...).Scan(&d.Sales)
	return d, nil
}

func exportConversionFunnel(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		data, err := queryConversionFunnel(r.Context(), pool, tu.TenantID, dateFrom, dateTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="conversion-funnel.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Stage", "Count"})
		_ = cw.Write([]string{"Quotations", strconv.FormatInt(data.Quotations, 10)})
		_ = cw.Write([]string{"Sales Orders", strconv.FormatInt(data.SalesOrders, 10)})
		_ = cw.Write([]string{"Released Lines", strconv.FormatInt(data.ReleasedLines, 10)})
		_ = cw.Write([]string{"Sales", strconv.FormatInt(data.Sales, 10)})
		cw.Flush()
	}
}

type lowStockRow struct {
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   int64   `json:"location_id"`
	LocationName string  `json:"location_name"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	ReorderLevel float64 `json:"reorder_level"`
	Shortfall    float64 `json:"shortfall"`
}

func lowStockSQL(tenantID int64) string {
	return `
		select i.id, i.item_code, i.item_name,
		  l.id, l.location_name,
		  bal.qty_on_hand::float8,
		  coalesce(bal.reorder_level, i.reorder_level)::float8,
		  (coalesce(bal.reorder_level, i.reorder_level) - bal.qty_on_hand)::float8
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		join public.inv_locations l on l.id = bal.location_id
		where bal.tenant_id = $1
		  and coalesce(bal.reorder_level, i.reorder_level) is not null
		  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`
}

func listLowStock(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"item_code": "item_code", "qty_on_hand": "qty_on_hand", "shortfall": "shortfall",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "shortfall", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base := lowStockSQL(tu.TenantID)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, tu.TenantID).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $2 offset $3", base, p.Sort, orderSQL(p.Order))
		rows, err := pool.Query(r.Context(), q, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []lowStockRow
		for rows.Next() {
			var row lowStockRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.ReorderLevel, &row.Shortfall); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []lowStockRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportLowStock(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := fmt.Sprintf("select * from (%s) sub order by shortfall desc limit %d", lowStockSQL(tu.TenantID), reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="low-stock.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Item Code", "Item Name", "Location", "Qty On Hand", "Reorder Level", "Shortfall"})
		for rows.Next() {
			var row lowStockRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.ReorderLevel, &row.Shortfall); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.ItemCode, row.ItemName, row.LocationName,
				fmt.Sprintf("%.4f", row.QtyOnHand), fmt.Sprintf("%.4f", row.ReorderLevel), fmt.Sprintf("%.4f", row.Shortfall),
			})
		}
		cw.Flush()
	}
}

type expiredQuotationRow struct {
	QuotationID   int64   `json:"quotation_id"`
	LineID        int64   `json:"line_id"`
	ReferenceNo   string  `json:"reference_no"`
	CustomerName  string  `json:"customer_name"`
	ValidUntil    *string `json:"valid_until,omitempty"`
	ItemCode      string  `json:"item_code"`
	ItemName      string  `json:"item_name"`
	Qty           float64 `json:"qty"`
	LineTotal     float64 `json:"line_total"`
}

func expiredQuotationsSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID, todayDate()}
	where := `q.tenant_id = $1 and q.deleted_at is null
	  and q.valid_until is not null and q.valid_until < $2::date`
	n := 3
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and q.order_date >= $%d::date and q.order_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select q.id, ln.id, q.reference_no, p.company_name, q.valid_until,
		  ln.item_code, ln.item_name, ln.qty::float8, ln.line_total::float8
		from public.quo_quotations q
		join public.quo_quotation_lines ln on ln.quotation_id = q.id
		join public.inv_partners p on p.id = q.partner_id
		where %s`, where)
	return q, args
}

func listExpiredQuotations(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"reference_no": "reference_no", "valid_until": "valid_until", "line_total": "line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		p := httputil.ParseListParams(r, "valid_until", allowed)
		offset := httputil.Offset(p)
		base, args := expiredQuotationsSQL(tu.TenantID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d",
			base, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []expiredQuotationRow
		for rows.Next() {
			var row expiredQuotationRow
			var validUntil *time.Time
			if err := rows.Scan(&row.QuotationID, &row.LineID, &row.ReferenceNo, &row.CustomerName,
				&validUntil, &row.ItemCode, &row.ItemName, &row.Qty, &row.LineTotal); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			row.ValidUntil = datePtrToStr(validUntil)
			out = append(out, row)
		}
		if out == nil {
			out = []expiredQuotationRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportExpiredQuotations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		base, args := expiredQuotationsSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by valid_until asc limit %d", base, reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="expired-quotations.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Reference No", "Customer", "Valid Until", "Item Code", "Item Name", "Qty", "Line Total"})
		for rows.Next() {
			var row expiredQuotationRow
			var validUntil *time.Time
			if err := rows.Scan(&row.QuotationID, &row.LineID, &row.ReferenceNo, &row.CustomerName,
				&validUntil, &row.ItemCode, &row.ItemName, &row.Qty, &row.LineTotal); err != nil {
				return
			}
			vu := ""
			if validUntil != nil {
				vu = validUntil.Format("2006-01-02")
			}
			_ = cw.Write([]string{
				row.ReferenceNo, row.CustomerName, vu, row.ItemCode, row.ItemName,
				fmt.Sprintf("%.4f", row.Qty), fmt.Sprintf("%.4f", row.LineTotal),
			})
		}
		cw.Flush()
	}
}
