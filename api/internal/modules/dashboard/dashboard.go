package dashboard

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/finance"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
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
		ctx := r.Context()
		today := todayDate()
		var out summaryResponse

		_ = pool.QueryRow(ctx, `
			select coalesce(sum(grand_total), 0)::float8
			from public.sa_sales
			where tenant_id = $1 and deleted_at is null
			  and order_date >= date_trunc('month', current_date)::date
			  and order_date <= current_date`,
			tu.TenantID).Scan(&out.SalesMTD)

		_ = pool.QueryRow(ctx, `
			select coalesce(sum(grand_total), 0)::float8
			from public.sa_sales
			where tenant_id = $1 and deleted_at is null
			  and order_date >= date_trunc('year', current_date)::date
			  and order_date <= current_date`,
			tu.TenantID).Scan(&out.SalesYTD)

		_ = pool.QueryRow(ctx, `
			select count(distinct bal.item_id || ':' || bal.location_id::text)
			from public.inv_item_location_balances bal
			join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
			where bal.tenant_id = $1
			  and coalesce(bal.reorder_level, i.reorder_level) is not null
			  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`,
			tu.TenantID).Scan(&out.LowStockCount)

		_ = pool.QueryRow(ctx, `
			select count(*) from (
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
			) ar`,
			tu.TenantID).Scan(&out.ArCustomers)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.po_purchase_order_lines ln
			join public.po_purchase_orders po on po.id = ln.purchase_order_id
			where po.tenant_id = $1 and po.deleted_at is null
			  and po.status not in ('cancelled', 'received')
			  and (ln.qty - ln.received_qty) > 0.0001`,
			tu.TenantID).Scan(&out.OpenPOLines)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.crm_follow_up_tasks t
			where t.tenant_id = $1 and t.stage in ('due_soon', 'overdue')
			  and t.task_type = 'warranty_follow_up'`,
			tu.TenantID).Scan(&out.WarrantyDue)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.quo_quotations q
			where q.tenant_id = $1 and q.deleted_at is null
			  and q.valid_until is not null and q.valid_until < $2::date`,
			tu.TenantID, today).Scan(&out.ExpiredQuotes)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.quo_quotations q
			where q.tenant_id = $1 and q.deleted_at is null
			  and q.valid_until is not null
			  and q.valid_until >= $2::date
			  and q.valid_until <= ($2::date + interval '7 days')::date`,
			tu.TenantID, today).Scan(&out.QuotesExpiring7d)

		out.UnbilledDueMilestones, _ = finance.CountUnbilledDueMilestones(ctx, pool, tu.TenantID)

		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}

func salesTrendHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		months := parseMonths(r)
		rows, err := pool.Query(r.Context(), `
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
			order by m.month_start`, tu.TenantID, months)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales trend.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		resp := trendResponse{Months: months, Points: []trendPoint{}}
		for rows.Next() {
			var pt trendPoint
			if err := rows.Scan(&pt.Period, &pt.Value); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales trend.", "ERR_INTERNAL")
				return
			}
			resp.Points = append(resp.Points, pt)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales trend.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, resp, "OK")
	}
}

func inventoryTrendHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		months := parseMonths(r)
		rows, err := pool.Query(r.Context(), `
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
			order by m.month_start`, tu.TenantID, months)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load inventory trend.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		resp := trendResponse{Months: months, Points: []trendPoint{}}
		for rows.Next() {
			var pt trendPoint
			if err := rows.Scan(&pt.Period, &pt.Value); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read inventory trend.", "ERR_INTERNAL")
				return
			}
			resp.Points = append(resp.Points, pt)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load inventory trend.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, resp, "OK")
	}
}

func topCustomersHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		limit := parseLimit(r)
		days := parseDays(r)
		rows, err := pool.Query(r.Context(), `
			select s.partner_id, p.company_name, coalesce(sum(s.grand_total), 0)::float8
			from public.sa_sales s
			join public.inv_partners p on p.id = s.partner_id
			where s.tenant_id = $1 and s.deleted_at is null
			  and s.order_date >= (current_date - make_interval(days => $2))::date
			group by s.partner_id, p.company_name
			order by 3 desc
			limit $3`, tu.TenantID, days, limit)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top customers.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []topCustomerRow{}
		for rows.Next() {
			var row topCustomerRow
			if err := rows.Scan(&row.PartnerID, &row.PartnerName, &row.TotalAmount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read top customers.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top customers.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func topVendorsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		limit := parseLimit(r)
		days := parseDays(r)
		rows, err := pool.Query(r.Context(), `
			select po.partner_id, p.company_name, coalesce(sum(po.grand_total), 0)::float8
			from public.po_purchase_orders po
			join public.inv_partners p on p.id = po.partner_id
			where po.tenant_id = $1 and po.deleted_at is null
			  and po.status <> 'cancelled'
			  and po.order_date >= (current_date - make_interval(days => $2))::date
			group by po.partner_id, p.company_name
			order by 3 desc
			limit $3`, tu.TenantID, days, limit)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top vendors.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []topVendorRow{}
		for rows.Next() {
			var row topVendorRow
			if err := rows.Scan(&row.PartnerID, &row.PartnerName, &row.TotalAmount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read top vendors.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top vendors.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func topItemsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		limit := parseLimit(r)
		days := parseDays(r)
		rows, err := pool.Query(r.Context(), `
			select ln.item_id, ln.item_code, ln.item_name, sum(ln.qty)::float8 as qty
			from public.sa_sales_lines ln
			join public.sa_sales s on s.id = ln.sales_id
			where s.tenant_id = $1 and s.deleted_at is null
			  and s.order_date >= (current_date - make_interval(days => $2))::date
			group by ln.item_id, ln.item_code, ln.item_name
			order by qty desc
			limit $3`, tu.TenantID, days, limit)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top items.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []topItemRow{}
		for rows.Next() {
			var row topItemRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.Qty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read top items.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load top items.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func redFlagsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		today := todayDate()

		categories := []redFlagCategory{
			{Code: "low_stock", Label: "Low stock"},
			{Code: "expired_quotes", Label: "Expired quotes"},
			{Code: "serial_qty_mismatch", Label: "Serial quantity mismatch"},
			{Code: "reserved_stale", Label: "Stale reserved serials"},
			{Code: "open_po", Label: "Open purchase order lines"},
			{Code: "so_release_gap", Label: "Sales order release gap"},
			{Code: "reserve_without_dr", Label: "Released, not delivered"},
			{Code: "dr_without_invoice", Label: "Delivered, not invoiced"},
			{Code: "gr_without_supplier_invoice", Label: "GR not fully billed"},
			{Code: "ap_over_application", Label: "AP over-applied payments"},
			{Code: "budget_overrun", Label: "Budget overrun"},
		}

		_ = pool.QueryRow(ctx, `
			select count(distinct bal.item_id || ':' || bal.location_id::text)
			from public.inv_item_location_balances bal
			join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
			where bal.tenant_id = $1
			  and coalesce(bal.reorder_level, i.reorder_level) is not null
			  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`,
			tu.TenantID).Scan(&categories[0].Count)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.quo_quotations q
			where q.tenant_id = $1 and q.deleted_at is null
			  and q.valid_until is not null and q.valid_until < $2::date`,
			tu.TenantID, today).Scan(&categories[1].Count)

		_ = pool.QueryRow(ctx, `
			select count(*) from (
			  select ln.id
			  from public.sa_sales_lines ln
			  join public.sa_sales s on s.id = ln.sales_id
			  join public.inv_items i on i.id = ln.item_id
			  left join (
			    select sales_line_id, count(*)::float8 as serial_cnt
			    from public.inv_serial_unit_sales_lines
			    group by sales_line_id
			  ) j on j.sales_line_id = ln.id
			  where s.tenant_id = $1 and s.deleted_at is null
			    and i.track_serial = true and ln.qty > 0
			    and coalesce(j.serial_cnt, 0) <> ln.qty
			  union
			  select rl.id
			  from public.so_sales_order_release_lines rl
			  join public.so_sales_order_lines ln on ln.id = rl.sales_order_line_id
			  join public.so_sales_orders so on so.id = ln.sales_order_id
			  join public.inv_items i on i.id = ln.item_id
			  left join (
			    select sales_order_release_line_id, count(*)::float8 as serial_cnt
			    from public.inv_serial_units
			    where sales_order_release_line_id is not null
			    group by sales_order_release_line_id
			  ) su on su.sales_order_release_line_id = rl.id
			  where so.tenant_id = $1 and so.deleted_at is null
			    and i.track_serial = true and rl.release_qty > 0
			    and coalesce(su.serial_cnt, 0) <> rl.release_qty
			) mismatches`,
			tu.TenantID).Scan(&categories[2].Count)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.inv_serial_units su
			where su.tenant_id = $1 and su.status = 'reserved'
			  and su.reserved_at is not null
			  and su.reserved_at < (now() - make_interval(days => $2))`,
			tu.TenantID, reservedStaleDays).Scan(&categories[3].Count)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.po_purchase_order_lines ln
			join public.po_purchase_orders po on po.id = ln.purchase_order_id
			where po.tenant_id = $1 and po.deleted_at is null
			  and po.status not in ('cancelled', 'received')
			  and (ln.qty - ln.received_qty) > 0.0001`,
			tu.TenantID).Scan(&categories[4].Count)

		_ = pool.QueryRow(ctx, `
			select count(distinct ln.id)
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			where so.tenant_id = $1 and so.deleted_at is null
			  and so.progress_status in ('unconfirmed', 'in_progress')
			  and (ln.qty - coalesce(rel.released, 0)) > 0.0001`,
			tu.TenantID).Scan(&categories[5].Count)

		_ = pool.QueryRow(ctx, `
			select count(distinct ln.id)
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as delivered
			  from public.so_sales_order_slip_lines
			  where slip_type = 'delivery_receipt'
			  group by sales_order_line_id
			) dr on dr.sales_order_line_id = ln.id
			where so.tenant_id = $1 and so.deleted_at is null
			  and coalesce(rel.released, 0) > 0.0001
			  and (coalesce(rel.released, 0) - coalesce(dr.delivered, 0)) > 0.0001`,
			tu.TenantID).Scan(&categories[6].Count)

		_ = pool.QueryRow(ctx, `
			select count(distinct ln.id)
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			left join (
			  select sales_order_line_id, sum(qty) as delivered
			  from public.so_sales_order_slip_lines
			  where slip_type = 'delivery_receipt'
			  group by sales_order_line_id
			) dr on dr.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as sold
			  from public.so_sales_order_slip_lines
			  where slip_type = 'sales'
			  group by sales_order_line_id
			) slip on slip.sales_order_line_id = ln.id
			where so.tenant_id = $1 and so.deleted_at is null
			  and coalesce(dr.delivered, 0) > 0.0001
			  and (coalesce(dr.delivered, 0) - coalesce(slip.sold, 0)) > 0.0001`,
			tu.TenantID).Scan(&categories[7].Count)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.gr_goods_receipt_lines grl
			join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
			left join (
			  select goods_receipt_line_id, sum(qty) as billed
			  from public.gr_goods_receipt_slip_lines
			  where slip_type = 'supplier_invoice'
			  group by goods_receipt_line_id
			) sl on sl.goods_receipt_line_id = grl.id
			where gr.tenant_id = $1 and gr.status = 'posted'
			  and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001`,
			tu.TenantID).Scan(&categories[8].Count)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.fin_supplier_invoices si
			left join (
			  select supplier_invoice_id, sum(applied_amount) as applied
			  from public.fin_payment_applications
			  group by supplier_invoice_id
			) paid on paid.supplier_invoice_id = si.id
			where si.tenant_id = $1 and si.deleted_at is null
			  and coalesce(paid.applied, 0) > si.grand_total + 0.0001`,
			tu.TenantID).Scan(&categories[9].Count)

		overruns, _ := processpolicy.CountBudgetOverruns(ctx, pool, tu.TenantID)
		categories[10].Count = overruns

		var total int64
		for _, c := range categories {
			total += c.Count
		}

		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, redFlagsResponse{TotalCount: total, Categories: categories}, "OK")
	}
}
