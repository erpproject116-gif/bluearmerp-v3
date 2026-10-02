package dashboard

import (
	"context"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/aggcache"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type summaryResponse struct {
	SalesMTD              float64 `json:"sales_mtd"`
	SalesYTD              float64 `json:"sales_ytd"`
	LowStockCount         int64   `json:"low_stock_count"`
	ArCustomers           int64   `json:"ar_customers"`
	OpenPOLines           int64   `json:"open_po_lines"`
	WarrantyDue           int64   `json:"warranty_due"`
	ExpiredQuotes         int64   `json:"expired_quotes"`
	QuotesExpiring7d      int64   `json:"quotes_expiring_7d"`
	UnbilledDueMilestones int64   `json:"unbilled_due_milestones"`
}

type trendPoint struct {
	Period string  `json:"period"`
	Value  float64 `json:"value"`
}

type trendResponse struct {
	Months int          `json:"months"`
	Points []trendPoint `json:"points"`
}

type topCustomerRow struct {
	PartnerID   int64   `json:"partner_id"`
	PartnerName string  `json:"partner_name"`
	TotalAmount float64 `json:"total_amount"`
}

type topVendorRow struct {
	PartnerID   int64   `json:"partner_id"`
	PartnerName string  `json:"partner_name"`
	TotalAmount float64 `json:"total_amount"`
}

type topItemRow struct {
	ItemID   *int64  `json:"item_id,omitempty"`
	ItemCode string  `json:"item_code"`
	ItemName string  `json:"item_name"`
	Qty      float64 `json:"qty"`
}

type redFlagCategory struct {
	Code  string `json:"code"`
	Label string `json:"label"`
	Count int64  `json:"count"`
}

type redFlagsResponse struct {
	TotalCount int64             `json:"total_count"`
	Categories []redFlagCategory `json:"categories"`
}

const reservedStaleDays = 7

func summaryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		out, err := aggcache.Load(aggcache.Key(tu.TenantID, "summary", ""), false, func() (summaryResponse, error) {
			return loadSummary(r.Context(), pool, tu.TenantID)
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load dashboard summary.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}

func loadSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (summaryResponse, error) {
	today := todayDate()
	var out summaryResponse
	err := pool.QueryRow(ctx, `
		select
		  (select coalesce(sum(grand_total), 0)::float8
		   from public.sa_sales
		   where tenant_id = $1 and deleted_at is null
		     and order_date >= date_trunc('month', current_date)::date
		     and order_date <= current_date),
		  (select coalesce(sum(grand_total), 0)::float8
		   from public.sa_sales
		   where tenant_id = $1 and deleted_at is null
		     and order_date >= date_trunc('year', current_date)::date
		     and order_date <= current_date),
		  (select count(distinct bal.item_id || ':' || bal.location_id::text)
		   from public.inv_item_location_balances bal
		   join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		   join public.inv_locations l on l.id = bal.location_id and l.tenant_id = bal.tenant_id
		   where bal.tenant_id = $1
		     and coalesce(l.is_rma, false) = false
		     and coalesce(l.location_type, 'location') <> 'in_transit'
		     and coalesce(bal.reorder_level, i.reorder_level) is not null
		     and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)),
		  (select count(*) from (
		     select s.partner_id
		     from public.sa_sales s
		     left join lateral (
		       select coalesce(sum(a.applied_amount), 0)::float8 as received
		       from public.fin_receipt_applications a
		       join public.fin_official_receipts r on r.id = a.official_receipt_id
		       where a.sales_id = s.id and r.deleted_at is null
		     ) recv on true
		     where s.tenant_id = $1 and s.deleted_at is null
		     group by s.partner_id
		     having coalesce(sum(s.grand_total), 0) - coalesce(sum(recv.received), 0) > 0
		   ) ar),
		  (select count(*)
		   from public.po_purchase_order_lines ln
		   join public.po_purchase_orders po on po.id = ln.purchase_order_id
		   where po.tenant_id = $1 and po.deleted_at is null
		     and po.status not in ('cancelled', 'received')
		     and (ln.qty - ln.received_qty) > 0.0001),
		  (select count(*) from public.crm_follow_up_tasks t
		   where t.tenant_id = $1 and t.stage in ('due_soon', 'overdue')
		     and t.task_type = 'warranty_follow_up'),
		  (select count(*) from public.quo_quotations q
		   where q.tenant_id = $1 and q.deleted_at is null
		     and q.valid_until is not null and q.valid_until < $2::date),
		  (select count(*) from public.quo_quotations q
		   where q.tenant_id = $1 and q.deleted_at is null
		     and q.valid_until is not null
		     and q.valid_until >= $2::date
		     and q.valid_until <= ($2::date + interval '7 days')::date),
		  (select count(*)
		   from public.fin_contract_milestones m
		   join public.fin_contracts c on c.id = m.contract_id
		   where c.tenant_id = $1
		     and c.status = 'active'
		     and m.status = 'pending'
		     and m.billed_sale_id is null
		     and m.due_date is not null
		     and m.due_date <= $2::date)`,
		tenantID, today).Scan(
		&out.SalesMTD,
		&out.SalesYTD,
		&out.LowStockCount,
		&out.ArCustomers,
		&out.OpenPOLines,
		&out.WarrantyDue,
		&out.ExpiredQuotes,
		&out.QuotesExpiring7d,
		&out.UnbilledDueMilestones,
	)
	return out, err
}

func salesTrendHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		months := parseMonths(r)
		resp, err := aggcache.Load(aggcache.Key(tu.TenantID, "sales-trend", strconv.Itoa(months)), true, func() (trendResponse, error) {
			return loadSalesTrend(r.Context(), pool, tu.TenantID, months)
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales trend.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, resp, "OK")
	}
}

func loadSalesTrend(ctx context.Context, pool *pgxpool.Pool, tenantID int64, months int) (trendResponse, error) {
	rows, err := pool.Query(ctx, `
			with months as (
			  select generate_series(
			    date_trunc('month', current_date) - (($2::int - 1) || ' months')::interval,
			    date_trunc('month', current_date),
			    '1 month'::interval
			  )::date as month_start
			)
			select to_char(m.month_start, 'YYYY-MM'),
			  coalesce(s.total, 0)::float8
			from months m
			left join (
			  select date_trunc('month', order_date)::date as month_start, sum(grand_total) as total
			  from public.sa_sales
			  where tenant_id = $1 and deleted_at is null
			    and order_date >= (select min(month_start) from months)
			  group by 1
			) s on s.month_start = m.month_start
			order by m.month_start`, tenantID, months)
	if err != nil {
		return trendResponse{}, err
	}
	defer rows.Close()

	resp := trendResponse{Months: months, Points: []trendPoint{}}
	for rows.Next() {
		var pt trendPoint
		if err := rows.Scan(&pt.Period, &pt.Value); err != nil {
			return trendResponse{}, err
		}
		resp.Points = append(resp.Points, pt)
	}
	if err := rows.Err(); err != nil {
		return trendResponse{}, err
	}
	return resp, nil
}

func inventoryTrendHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		months := parseMonths(r)
		resp, err := aggcache.Load(aggcache.Key(tu.TenantID, "inventory-trend", strconv.Itoa(months)), true, func() (trendResponse, error) {
			return loadInventoryTrend(r.Context(), pool, tu.TenantID, months)
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load inventory trend.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, resp, "OK")
	}
}

func loadInventoryTrend(ctx context.Context, pool *pgxpool.Pool, tenantID int64, months int) (trendResponse, error) {
	rows, err := pool.Query(ctx, `
			with months as (
			  select generate_series(
			    date_trunc('month', current_date) - (($2::int - 1) || ' months')::interval,
			    date_trunc('month', current_date),
			    '1 month'::interval
			  )::date as month_start
			)
			select to_char(m.month_start, 'YYYY-MM'),
			  coalesce(mv.total, 0)::float8
			from months m
			left join (
			  select date_trunc('month', created_at)::date as month_start,
			    sum(case when qty_delta > 0 then qty_delta else 0 end) as total
			  from public.inv_stock_movements
			  where tenant_id = $1
			    and created_at >= (select min(month_start) from months)
			  group by 1
			) mv on mv.month_start = m.month_start
			order by m.month_start`, tenantID, months)
	if err != nil {
		return trendResponse{}, err
	}
	defer rows.Close()

	resp := trendResponse{Months: months, Points: []trendPoint{}}
	for rows.Next() {
		var pt trendPoint
		if err := rows.Scan(&pt.Period, &pt.Value); err != nil {
			return trendResponse{}, err
		}
		resp.Points = append(resp.Points, pt)
	}
	if err := rows.Err(); err != nil {
		return trendResponse{}, err
	}
	return resp, nil
}

func topCustomersHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		limit := parseLimit(r)
		days := parseDays(r)
		extra := strconv.Itoa(days) + "|" + strconv.Itoa(limit)
		out, err := aggcache.Load(aggcache.Key(tu.TenantID, "top-customers", extra), true, func() ([]topCustomerRow, error) {
			return loadTopCustomers(r.Context(), pool, tu.TenantID, days, limit)
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top customers.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func loadTopCustomers(ctx context.Context, pool *pgxpool.Pool, tenantID int64, days, limit int) ([]topCustomerRow, error) {
	rows, err := pool.Query(ctx, `
		select s.partner_id, p.company_name, coalesce(sum(s.grand_total), 0)::float8
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= (current_date - make_interval(days => $2))::date
		group by s.partner_id, p.company_name
		order by 3 desc
		limit $3`, tenantID, days, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []topCustomerRow{}
	for rows.Next() {
		var row topCustomerRow
		if err := rows.Scan(&row.PartnerID, &row.PartnerName, &row.TotalAmount); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func topVendorsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		limit := parseLimit(r)
		days := parseDays(r)
		extra := strconv.Itoa(days) + "|" + strconv.Itoa(limit)
		out, err := aggcache.Load(aggcache.Key(tu.TenantID, "top-vendors", extra), true, func() ([]topVendorRow, error) {
			return loadTopVendors(r.Context(), pool, tu.TenantID, days, limit)
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top vendors.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func loadTopVendors(ctx context.Context, pool *pgxpool.Pool, tenantID int64, days, limit int) ([]topVendorRow, error) {
	rows, err := pool.Query(ctx, `
		select po.partner_id, p.company_name, coalesce(sum(po.grand_total), 0)::float8
		from public.po_purchase_orders po
		join public.inv_partners p on p.id = po.partner_id
		where po.tenant_id = $1 and po.deleted_at is null
		  and po.status <> 'cancelled'
		  and po.order_date >= (current_date - make_interval(days => $2))::date
		group by po.partner_id, p.company_name
		order by 3 desc
		limit $3`, tenantID, days, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []topVendorRow{}
	for rows.Next() {
		var row topVendorRow
		if err := rows.Scan(&row.PartnerID, &row.PartnerName, &row.TotalAmount); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func topItemsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		limit := parseLimit(r)
		days := parseDays(r)
		extra := strconv.Itoa(days) + "|" + strconv.Itoa(limit)
		out, err := aggcache.Load(aggcache.Key(tu.TenantID, "top-items", extra), true, func() ([]topItemRow, error) {
			return loadTopItems(r.Context(), pool, tu.TenantID, days, limit)
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top items.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func loadTopItems(ctx context.Context, pool *pgxpool.Pool, tenantID int64, days, limit int) ([]topItemRow, error) {
	rows, err := pool.Query(ctx, `
		select ln.item_id, ln.item_code, ln.item_name, sum(ln.qty)::float8 as qty
		from public.sa_sales_lines ln
		join public.sa_sales s on s.id = ln.sales_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= (current_date - make_interval(days => $2))::date
		group by ln.item_id, ln.item_code, ln.item_name
		order by qty desc
		limit $3`, tenantID, days, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []topItemRow{}
	for rows.Next() {
		var row topItemRow
		if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.Qty); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func redFlagsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		out, err := aggcache.Load(aggcache.Key(tu.TenantID, "red-flags", ""), false, func() (redFlagsResponse, error) {
			return loadRedFlags(r.Context(), pool, tu.TenantID)
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load red flags.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}
