package dashboard

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type namedCount struct {
	Code  string  `json:"code"`
	Label string  `json:"label"`
	Count int64   `json:"count"`
	Href  string  `json:"href,omitempty"`
	Qty   float64 `json:"qty,omitempty"`
}

type namedAmountRow struct {
	PartnerID   int64   `json:"partner_id,omitempty"`
	PartnerName string  `json:"partner_name,omitempty"`
	ItemCode    string  `json:"item_code,omitempty"`
	ItemName    string  `json:"item_name,omitempty"`
	TotalAmount float64 `json:"total_amount,omitempty"`
	Qty         float64 `json:"qty,omitempty"`
}

type classifiedDocRow struct {
	ID          int64   `json:"id"`
	DocNo       string  `json:"doc_no"`
	PartnerName string  `json:"partner_name"`
	ReasonCode  string  `json:"reason_code"`
	ReasonLabel string  `json:"reason_label"`
	AgeDays     int     `json:"age_days"`
	Amount      float64 `json:"amount"`
	Href        string  `json:"href"`
}

type classifiedBlock struct {
	OpenHeaders       int64              `json:"open_headers"`
	ClassifiedHeaders int64              `json:"classified_headers"`
	ByReason          []namedCount       `json:"by_reason"`
	Top               []classifiedDocRow `json:"top"`
}

type followUpTopRow struct {
	ID      int64  `json:"id"`
	Title   string `json:"title"`
	Stage   string `json:"stage"`
	DueDate string `json:"due_date"`
	Href    string `json:"href"`
}

type opsIntelligenceResponse struct {
	AsOf      string `json:"as_of"`
	Inventory struct {
		LowStock       int64        `json:"low_stock"`
		ZeroStock      int64        `json:"zero_stock"`
		SerialMismatch int64        `json:"serial_mismatch"`
		ReservedStale  int64        `json:"reserved_stale"`
		InboundTrend   []trendPoint `json:"inbound_trend"`
		InboundByType  []namedCount `json:"inbound_by_type"`
	} `json:"inventory"`
	Sales struct {
		MTD          float64          `json:"mtd"`
		YTD          float64          `json:"ytd"`
		Trend        []trendPoint     `json:"trend"`
		TopCustomers []namedAmountRow `json:"top_customers"`
		TopItems     []namedAmountRow `json:"top_items"`
	} `json:"sales"`
	SalesOrders    classifiedBlock `json:"sales_orders"`
	PurchaseOrders classifiedBlock `json:"purchase_orders"`
	Purchases      struct {
		MTD             float64          `json:"mtd"`
		GRUnbilledLines int64            `json:"gr_unbilled_lines"`
		GRBilledLines   int64            `json:"gr_billed_lines"`
		TopVendors      []namedAmountRow `json:"top_vendors"`
	} `json:"purchases"`
	FollowUp struct {
		ByStage          []namedCount     `json:"by_stage"`
		ByType           []namedCount     `json:"by_type"`
		QuotesExpiring7d int64            `json:"quotes_expiring_7d"`
		ExpiredQuotes    int64            `json:"expired_quotes"`
		PendingApprovals int64            `json:"pending_approvals"`
		Top              []followUpTopRow `json:"top"`
	} `json:"follow_up"`
}

func opsIntelligenceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		today := todayDate()
		out := opsIntelligenceResponse{AsOf: today.Format("2006-01-02")}
		out.Inventory.InboundTrend = []trendPoint{}
		out.Inventory.InboundByType = []namedCount{}
		out.Sales.Trend = []trendPoint{}
		out.Sales.TopCustomers = []namedAmountRow{}
		out.Sales.TopItems = []namedAmountRow{}
		out.SalesOrders.ByReason = emptyReasonCounts(soReasonOrder)
		out.SalesOrders.Top = []classifiedDocRow{}
		out.PurchaseOrders.ByReason = emptyReasonCounts(poReasonOrder)
		out.PurchaseOrders.Top = []classifiedDocRow{}
		out.Purchases.TopVendors = []namedAmountRow{}
		out.FollowUp.ByStage = []namedCount{}
		out.FollowUp.ByType = []namedCount{}
		out.FollowUp.Top = []followUpTopRow{}

		loadOpsInventory(ctx, pool, tu.TenantID, &out)
		loadOpsSales(ctx, pool, tu.TenantID, &out)
		loadOpsSalesOrders(ctx, pool, tu.TenantID, today, &out)
		loadOpsPurchaseOrders(ctx, pool, tu.TenantID, today, &out)
		loadOpsPurchases(ctx, pool, tu.TenantID, &out)
		loadOpsFollowUp(ctx, pool, tu.TenantID, today, &out)

		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func emptyReasonCounts(list []reasonMeta) []namedCount {
	out := make([]namedCount, 0, len(list))
	for _, m := range list {
		out = append(out, namedCount{Code: m.Code, Label: m.Label, Href: m.Href, Count: 0})
	}
	return out
}

func bumpReason(list []namedCount, code string) {
	for i := range list {
		if list[i].Code == code {
			list[i].Count++
			return
		}
	}
}

func countInt(ctx context.Context, pool *pgxpool.Pool, q string, args ...any) int64 {
	var n int64
	_ = pool.QueryRow(ctx, q, args...).Scan(&n)
	return n
}

func sumFloat8(ctx context.Context, pool *pgxpool.Pool, q string, args ...any) float64 {
	var n float64
	_ = pool.QueryRow(ctx, q, args...).Scan(&n)
	return n
}

func loadTrendMonths(ctx context.Context, pool *pgxpool.Pool, tenantID int64, sql string) []trendPoint {
	rows, err := pool.Query(ctx, sql, tenantID, 12)
	if err != nil {
		return []trendPoint{}
	}
	defer rows.Close()
	out := []trendPoint{}
	for rows.Next() {
		var pt trendPoint
		if err := rows.Scan(&pt.Period, &pt.Value); err != nil {
			return out
		}
		out = append(out, pt)
	}
	return out
}

func loadOpsInventory(ctx context.Context, pool *pgxpool.Pool, tenantID int64, out *opsIntelligenceResponse) {
	out.Inventory.LowStock = countInt(ctx, pool, `
		select count(distinct bal.item_id || ':' || bal.location_id::text)
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		where bal.tenant_id = $1
		  and coalesce(bal.reorder_level, i.reorder_level) is not null
		  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`, tenantID)
	out.Inventory.ZeroStock = countInt(ctx, pool, `
		select count(distinct bal.item_id)::bigint from public.inv_item_location_balances bal
		where bal.tenant_id = $1 and bal.qty_on_hand <= 0`, tenantID)
	out.Inventory.SerialMismatch = countInt(ctx, pool, `
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
		) mismatches`, tenantID)
	out.Inventory.ReservedStale = countInt(ctx, pool, `
		select count(*) from public.inv_serial_units su
		where su.tenant_id = $1 and su.status = 'reserved'
		  and su.reserved_at is not null
		  and su.reserved_at < (now() - make_interval(days => $2))`, tenantID, reservedStaleDays)
	out.Inventory.InboundTrend = loadTrendMonths(ctx, pool, tenantID, `
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
		order by m.month_start`)

	typeRows, err := pool.Query(ctx, `
		select coalesce(nullif(trim(movement_type), ''), 'other'),
		  coalesce(sum(qty_delta), 0)::float8
		from public.inv_stock_movements
		where tenant_id = $1 and qty_delta > 0
		  and created_at >= (date_trunc('month', current_date) - interval '11 months')
		group by 1`, tenantID)
	if err == nil {
		defer typeRows.Close()
		bucket := map[string]float64{}
		for typeRows.Next() {
			var code string
			var qty float64
			if err := typeRows.Scan(&code, &qty); err != nil {
				continue
			}
			norm := normalizeInboundType(code)
			bucket[norm] += qty
		}
		order := []string{"goods_receipt", "receipt", "transfer_in", "adjustment", "other"}
		for _, code := range order {
			qty := bucket[code]
			if qty == 0 {
				continue
			}
			out.Inventory.InboundByType = append(out.Inventory.InboundByType, namedCount{
				Code: code, Label: inboundTypeLabel(code), Qty: qty, Count: int64(qty + 0.5),
			})
		}
	}
}

func loadOpsSales(ctx context.Context, pool *pgxpool.Pool, tenantID int64, out *opsIntelligenceResponse) {
	out.Sales.MTD = sumFloat8(ctx, pool, `
		select coalesce(sum(grand_total), 0)::float8
		from public.sa_sales
		where tenant_id = $1 and deleted_at is null
		  and order_date >= date_trunc('month', current_date)::date
		  and order_date <= current_date`, tenantID)
	out.Sales.YTD = sumFloat8(ctx, pool, `
		select coalesce(sum(grand_total), 0)::float8
		from public.sa_sales
		where tenant_id = $1 and deleted_at is null
		  and order_date >= date_trunc('year', current_date)::date
		  and order_date <= current_date`, tenantID)
	out.Sales.Trend = loadTrendMonths(ctx, pool, tenantID, `
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
		order by m.month_start`)

	cRows, err := pool.Query(ctx, `
		select s.partner_id, p.company_name, coalesce(sum(s.grand_total), 0)::float8
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= (current_date - interval '90 days')::date
		group by s.partner_id, p.company_name
		order by 3 desc
		limit 10`, tenantID)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var row namedAmountRow
			if err := cRows.Scan(&row.PartnerID, &row.PartnerName, &row.TotalAmount); err != nil {
				break
			}
			out.Sales.TopCustomers = append(out.Sales.TopCustomers, row)
		}
	}
	iRows, err := pool.Query(ctx, `
		select ln.item_code, ln.item_name, sum(ln.qty)::float8 as qty
		from public.sa_sales_lines ln
		join public.sa_sales s on s.id = ln.sales_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= (current_date - interval '90 days')::date
		group by ln.item_code, ln.item_name
		order by qty desc
		limit 10`, tenantID)
	if err == nil {
		defer iRows.Close()
		for iRows.Next() {
			var row namedAmountRow
			if err := iRows.Scan(&row.ItemCode, &row.ItemName, &row.Qty); err != nil {
				break
			}
			out.Sales.TopItems = append(out.Sales.TopItems, row)
		}
	}
}

func loadOpsSalesOrders(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time, out *opsIntelligenceResponse) {
	rows, err := pool.Query(ctx, `
		select so.id, so.sales_order_no, so.progress_status, so.grand_total::float8, so.order_date,
		  coalesce(p.company_name, ''),
		  coalesce(sum(ln.qty), 0)::float8,
		  coalesce(sum(rel.released), 0)::float8,
		  coalesce(sum(dr.delivered), 0)::float8,
		  coalesce(sum(slip.sold), 0)::float8
		from public.so_sales_orders so
		left join public.inv_partners p on p.id = so.partner_id
		left join public.so_sales_order_lines ln on ln.sales_order_id = so.id
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
		left join (
		  select sales_order_line_id, sum(qty) as sold
		  from public.so_sales_order_slip_lines
		  where slip_type = 'sales'
		  group by sales_order_line_id
		) slip on slip.sales_order_line_id = ln.id
		where so.tenant_id = $1 and so.deleted_at is null
		group by so.id, so.sales_order_no, so.progress_status, so.grand_total, so.order_date, p.company_name`, tenantID)
	if err != nil {
		return
	}
	defer rows.Close()

	type soAgg struct {
		id                                   int64
		progress, docNo, partner             string
		amount                               float64
		orderDate                            time.Time
		ordered, released, delivered, billed float64
	}
	var classified []soAgg
	for rows.Next() {
		var row soAgg
		if err := rows.Scan(&row.id, &row.docNo, &row.progress, &row.amount, &row.orderDate, &row.partner,
			&row.ordered, &row.released, &row.delivered, &row.billed); err != nil {
			return
		}
		if soOpenHeader(row.progress) {
			out.SalesOrders.OpenHeaders++
		}
		if !soHeaderIncluded(row.progress, row.ordered, row.released, row.delivered, row.billed) {
			continue
		}
		classified = append(classified, row)
		code := classifySOReason(row.progress, row.ordered, row.released, row.delivered, row.billed)
		bumpReason(out.SalesOrders.ByReason, code)
	}
	out.SalesOrders.ClassifiedHeaders = int64(len(classified))
	sort.Slice(classified, func(i, j int) bool { return classified[i].orderDate.Before(classified[j].orderDate) })
	limit := 10
	if len(classified) < limit {
		limit = len(classified)
	}
	for i := 0; i < limit; i++ {
		row := classified[i]
		code := classifySOReason(row.progress, row.ordered, row.released, row.delivered, row.billed)
		meta := metaByCode(soReasonOrder, code)
		age := int(today.Sub(row.orderDate).Hours() / 24)
		if age < 0 {
			age = 0
		}
		out.SalesOrders.Top = append(out.SalesOrders.Top, classifiedDocRow{
			ID: row.id, DocNo: row.docNo, PartnerName: row.partner,
			ReasonCode: code, ReasonLabel: meta.Label, AgeDays: age, Amount: row.amount, Href: meta.Href,
		})
	}
}

func loadOpsPurchaseOrders(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time, out *opsIntelligenceResponse) {
	rows, err := pool.Query(ctx, `
		select po.id, po.purchase_order_no, coalesce(po.progress_status, 'unconfirmed'), po.status,
		  po.grand_total::float8, po.order_date, coalesce(p.company_name, ''),
		  coalesce(sum(ln.qty - ln.received_qty), 0)::float8,
		  coalesce(max(unbilled.unbilled_qty), 0)::float8
		from public.po_purchase_orders po
		left join public.inv_partners p on p.id = po.partner_id
		left join public.po_purchase_order_lines ln on ln.purchase_order_id = po.id
		left join (
		  select gr.purchase_order_id,
		    sum(grl.received_qty - coalesce(sl.billed, 0))::float8 as unbilled_qty
		  from public.gr_goods_receipt_lines grl
		  join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		  left join (
		    select goods_receipt_line_id, sum(qty) as billed
		    from public.gr_goods_receipt_slip_lines
		    where slip_type = 'supplier_invoice'
		    group by goods_receipt_line_id
		  ) sl on sl.goods_receipt_line_id = grl.id
		  where gr.status = 'posted'
		    and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001
		  group by gr.purchase_order_id
		) unbilled on unbilled.purchase_order_id = po.id
		where po.tenant_id = $1 and po.deleted_at is null and po.status <> 'cancelled'
		group by po.id, po.purchase_order_no, po.progress_status, po.status, po.grand_total, po.order_date, p.company_name`, tenantID)
	if err != nil {
		return
	}
	defer rows.Close()

	type poAgg struct {
		id                               int64
		docNo, progress, status, partner string
		amount                           float64
		orderDate                        time.Time
		openQty, unbilledQty             float64
	}
	var classified []poAgg
	for rows.Next() {
		var row poAgg
		if err := rows.Scan(&row.id, &row.docNo, &row.progress, &row.status, &row.amount, &row.orderDate,
			&row.partner, &row.openQty, &row.unbilledQty); err != nil {
			return
		}
		if row.progress != "completed" {
			out.PurchaseOrders.OpenHeaders++
		}
		if !poHeaderIncluded(row.progress, row.status, row.openQty, row.unbilledQty) {
			continue
		}
		classified = append(classified, row)
		code := classifyPOReason(row.progress, row.status, row.openQty, row.unbilledQty)
		bumpReason(out.PurchaseOrders.ByReason, code)
	}
	out.PurchaseOrders.ClassifiedHeaders = int64(len(classified))
	sort.Slice(classified, func(i, j int) bool { return classified[i].orderDate.Before(classified[j].orderDate) })
	limit := 10
	if len(classified) < limit {
		limit = len(classified)
	}
	for i := 0; i < limit; i++ {
		row := classified[i]
		code := classifyPOReason(row.progress, row.status, row.openQty, row.unbilledQty)
		meta := metaByCode(poReasonOrder, code)
		age := int(today.Sub(row.orderDate).Hours() / 24)
		if age < 0 {
			age = 0
		}
		out.PurchaseOrders.Top = append(out.PurchaseOrders.Top, classifiedDocRow{
			ID: row.id, DocNo: row.docNo, PartnerName: row.partner,
			ReasonCode: code, ReasonLabel: meta.Label, AgeDays: age, Amount: row.amount, Href: meta.Href,
		})
	}
}

func loadOpsPurchases(ctx context.Context, pool *pgxpool.Pool, tenantID int64, out *opsIntelligenceResponse) {
	out.Purchases.MTD = sumFloat8(ctx, pool, `
		select coalesce(sum(grand_total), 0)::float8
		from public.fin_supplier_invoices
		where tenant_id = $1 and deleted_at is null
		  and invoice_date >= date_trunc('month', current_date)::date
		  and invoice_date <= current_date`, tenantID)
	_ = pool.QueryRow(ctx, `
		select
		  count(*) filter (where (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001),
		  count(*) filter (where (grl.received_qty - coalesce(sl.billed, 0)) <= 0.0001)
		from public.gr_goods_receipt_lines grl
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		left join (
		  select goods_receipt_line_id, sum(qty) as billed
		  from public.gr_goods_receipt_slip_lines
		  where slip_type = 'supplier_invoice'
		  group by goods_receipt_line_id
		) sl on sl.goods_receipt_line_id = grl.id
		where gr.tenant_id = $1 and gr.status = 'posted'`, tenantID).Scan(&out.Purchases.GRUnbilledLines, &out.Purchases.GRBilledLines)

	vRows, err := pool.Query(ctx, `
		select po.partner_id, p.company_name, coalesce(sum(po.grand_total), 0)::float8
		from public.po_purchase_orders po
		join public.inv_partners p on p.id = po.partner_id
		where po.tenant_id = $1 and po.deleted_at is null
		  and po.status <> 'cancelled'
		  and po.order_date >= (current_date - interval '90 days')::date
		group by po.partner_id, p.company_name
		order by 3 desc
		limit 10`, tenantID)
	if err == nil {
		defer vRows.Close()
		for vRows.Next() {
			var row namedAmountRow
			if err := vRows.Scan(&row.PartnerID, &row.PartnerName, &row.TotalAmount); err != nil {
				break
			}
			out.Purchases.TopVendors = append(out.Purchases.TopVendors, row)
		}
	}
}

func loadOpsFollowUp(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time, out *opsIntelligenceResponse) {
	sRows, err := pool.Query(ctx, `
		select stage, count(*)::bigint
		from public.crm_follow_up_tasks
		where tenant_id = $1 and stage not in ('completed', 'cancelled', 'closed')
		group by stage
		order by 2 desc`, tenantID)
	if err == nil {
		defer sRows.Close()
		for sRows.Next() {
			var code string
			var n int64
			if err := sRows.Scan(&code, &n); err != nil {
				break
			}
			label := followUpStageLabels[code]
			if label == "" {
				label = code
			}
			out.FollowUp.ByStage = append(out.FollowUp.ByStage, namedCount{Code: code, Label: label, Count: n, Href: "/app/crm/follow-up-tasks"})
		}
	}
	tRows, err := pool.Query(ctx, `
		select task_type, count(*)::bigint
		from public.crm_follow_up_tasks
		where tenant_id = $1 and stage not in ('completed', 'cancelled', 'closed')
		group by task_type
		order by 2 desc`, tenantID)
	if err == nil {
		defer tRows.Close()
		for tRows.Next() {
			var code string
			var n int64
			if err := tRows.Scan(&code, &n); err != nil {
				break
			}
			label := followUpTypeLabels[code]
			if label == "" {
				label = code
			}
			out.FollowUp.ByType = append(out.FollowUp.ByType, namedCount{Code: code, Label: label, Count: n, Href: "/app/crm/follow-up-tasks"})
		}
	}
	out.FollowUp.ExpiredQuotes = countInt(ctx, pool, `
		select count(*) from public.quo_quotations q
		where q.tenant_id = $1 and q.deleted_at is null
		  and q.valid_until is not null and q.valid_until < $2::date`, tenantID, today)
	out.FollowUp.QuotesExpiring7d = countInt(ctx, pool, `
		select count(*) from public.quo_quotations q
		where q.tenant_id = $1 and q.deleted_at is null
		  and q.valid_until is not null
		  and q.valid_until >= $2::date
		  and q.valid_until <= ($2::date + interval '7 days')::date`, tenantID, today)
	out.FollowUp.PendingApprovals = countInt(ctx, pool, `
		select count(*) from public.approval_requests
		where tenant_id = $1 and status = 'e_approval'`, tenantID)

	topRows, err := pool.Query(ctx, `
		select id, coalesce(title, ''), stage, due_date::text
		from public.crm_follow_up_tasks
		where tenant_id = $1 and stage not in ('completed', 'cancelled', 'closed')
		order by due_date asc, id asc
		limit 10`, tenantID)
	if err == nil {
		defer topRows.Close()
		for topRows.Next() {
			var row followUpTopRow
			if err := topRows.Scan(&row.ID, &row.Title, &row.Stage, &row.DueDate); err != nil {
				break
			}
			row.Href = "/app/crm/follow-up-tasks"
			out.FollowUp.Top = append(out.FollowUp.Top, row)
		}
	}
}
