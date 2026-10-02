package dashboard

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func loadRedFlags(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (redFlagsResponse, error) {
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
		{Code: "overdue_ar", Label: "Overdue customer invoices"},
	}
	err := pool.QueryRow(ctx, `
		select
		  (select count(distinct bal.item_id || ':' || bal.location_id::text)
		   from public.inv_item_location_balances bal
		   join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		   join public.inv_locations l on l.id = bal.location_id and l.tenant_id = bal.tenant_id
		   where bal.tenant_id = $1
		     and coalesce(l.is_rma, false) = false
		     and coalesce(l.location_type, 'location') <> 'in_transit'
		     and coalesce(bal.reorder_level, i.reorder_level) is not null
		     and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)),
		  (select count(*) from public.quo_quotations q
		   where q.tenant_id = $1 and q.deleted_at is null
		     and q.valid_until is not null and q.valid_until < $2::date),
		  (select count(*) from (
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
		   ) mismatches),
		  (select count(*) from public.inv_serial_units su
		   where su.tenant_id = $1 and su.status = 'reserved'
		     and su.reserved_at is not null
		     and su.reserved_at < (now() - make_interval(days => $3))),
		  (select count(*)
		   from public.po_purchase_order_lines ln
		   join public.po_purchase_orders po on po.id = ln.purchase_order_id
		   where po.tenant_id = $1 and po.deleted_at is null
		     and po.status not in ('cancelled', 'received')
		     and (ln.qty - ln.received_qty) > 0.0001),
		  (select count(distinct ln.id)
		   from public.so_sales_order_lines ln
		   join public.so_sales_orders so on so.id = ln.sales_order_id
		   left join (
		     select sales_order_line_id, sum(release_qty) as released
		     from public.so_sales_order_release_lines
		     group by sales_order_line_id
		   ) rel on rel.sales_order_line_id = ln.id
		   where so.tenant_id = $1 and so.deleted_at is null
		     and so.progress_status in ('unconfirmed', 'in_progress')
		     and (ln.qty - coalesce(rel.released, 0)) > 0.0001),
		  (select count(distinct ln.id)
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
		     and (coalesce(rel.released, 0) - coalesce(dr.delivered, 0)) > 0.0001),
		  (select count(distinct ln.id)
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
		     and (coalesce(dr.delivered, 0) - coalesce(slip.sold, 0)) > 0.0001),
		  (select count(*)
		   from public.gr_goods_receipt_lines grl
		   join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		   left join (
		     select goods_receipt_line_id, sum(qty) as billed
		     from public.gr_goods_receipt_slip_lines
		     where slip_type = 'supplier_invoice'
		     group by goods_receipt_line_id
		   ) sl on sl.goods_receipt_line_id = grl.id
		   where gr.tenant_id = $1 and gr.status = 'posted'
		     and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001),
		  (select count(*)
		   from public.fin_supplier_invoices si
		   left join (
		     select supplier_invoice_id, sum(applied_amount) as applied
		     from public.fin_payment_applications
		     group by supplier_invoice_id
		   ) paid on paid.supplier_invoice_id = si.id
		   where si.tenant_id = $1 and si.deleted_at is null
		     and coalesce(paid.applied, 0) > si.grand_total + 0.0001),
		  (select count(*) from (
		     select bl.id
		     from public.fin_budget_lines bl
		     join public.fin_budget_headers bh on bh.id = bl.budget_id
		     where bh.tenant_id = $1 and bh.status = 'active'
		       and bl.period_month >= date_trunc('month', current_date)::date
		       and coalesce((
		         select sum(l.debit - l.credit)::float8
		         from public.fin_journal_entry_lines l
		         join public.fin_journal_entries je on je.id = l.journal_entry_id
		         where je.tenant_id = $1 and je.status = 'posted'
		           and l.account_id = bl.account_id
		           and date_trunc('month', je.entry_date)::date = bl.period_month
		       ), 0) > bl.amount + 0.0001
		   ) overruns),
		  (select count(*) from public.sa_sales s
		   left join lateral (
		     select coalesce(sum(a.applied_amount), 0)::float8 as received
		     from public.fin_receipt_applications a
		     join public.fin_official_receipts r on r.id = a.official_receipt_id
		     where a.sales_id = s.id and r.deleted_at is null
		   ) recv on true
		   where s.tenant_id = $1 and s.deleted_at is null
		     and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		     and ($2::date - coalesce(s.due_date, s.order_date)::date) > 0)`,
		tenantID, today, reservedStaleDays).Scan(
		&categories[0].Count,
		&categories[1].Count,
		&categories[2].Count,
		&categories[3].Count,
		&categories[4].Count,
		&categories[5].Count,
		&categories[6].Count,
		&categories[7].Count,
		&categories[8].Count,
		&categories[9].Count,
		&categories[10].Count,
		&categories[11].Count,
	)
	if err != nil {
		return redFlagsResponse{}, err
	}
	var total int64
	for _, c := range categories {
		total += c.Count
	}
	return redFlagsResponse{TotalCount: total, Categories: categories}, nil
}
