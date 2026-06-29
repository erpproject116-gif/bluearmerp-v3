-- Verify seed-demo-po-gr-open.sql results
-- Expect DEMOGR902–905 per tenant with lines and open qty on 902/903/904

select t.company_code,
  po.purchase_order_no,
  po.status,
  pol.qty::float8 as order_qty,
  pol.received_qty::float8 as received_qty,
  (pol.qty - pol.received_qty)::float8 as open_qty,
  pol.item_code,
  i.track_serial,
  (select count(*) from public.gr_goods_receipts gr where gr.purchase_order_id = po.id) as gr_count
from public.po_purchase_orders po
join public.tenants t on t.id = po.tenant_id
left join public.po_purchase_order_lines pol on pol.purchase_order_id = po.id
left join public.inv_items i on i.id = pol.item_id
where po.purchase_order_no in ('DEMOGR902', 'DEMOGR903', 'DEMOGR904', 'DEMOGR905')
order by t.company_code, po.purchase_order_no;
