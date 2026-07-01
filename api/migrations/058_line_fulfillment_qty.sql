-- Persisted fulfillment quantities on commercial lines (ERPNext-style ordered/delivered/billed).
begin;

alter table public.so_sales_order_lines
  add column if not exists delivered_qty numeric(18,4) not null default 0,
  add column if not exists billed_qty numeric(18,4) not null default 0;

alter table public.po_purchase_order_lines
  add column if not exists billed_qty numeric(18,4) not null default 0;

alter table public.sa_sales_lines
  add column if not exists returned_qty numeric(18,4) not null default 0;

-- Backfill SO delivered from delivery receipt slips
update public.so_sales_order_lines ln
set delivered_qty = coalesce(sl.delivered, 0)
from (
  select sales_order_line_id, sum(qty) as delivered
  from public.so_sales_order_slip_lines
  where slip_type = 'delivery_receipt'
  group by sales_order_line_id
) sl
where ln.id = sl.sales_order_line_id;

-- Backfill SO billed from sales slips
update public.so_sales_order_lines ln
set billed_qty = coalesce(sl.sold, 0)
from (
  select sales_order_line_id, sum(qty) as sold
  from public.so_sales_order_slip_lines
  where slip_type = 'sales'
  group by sales_order_line_id
) sl
where ln.id = sl.sales_order_line_id;

-- Backfill PO billed from supplier invoice slips
update public.po_purchase_order_lines pol
set billed_qty = coalesce(sl.billed, 0)
from (
  select grl.purchase_order_line_id, sum(gs.qty) as billed
  from public.gr_goods_receipt_slip_lines gs
  join public.gr_goods_receipt_lines grl on grl.id = gs.goods_receipt_line_id
  where gs.slip_type = 'supplier_invoice'
  group by grl.purchase_order_line_id
) sl
where pol.id = sl.purchase_order_line_id;

commit;
