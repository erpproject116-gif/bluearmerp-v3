-- Make-to-order: link work orders to sales order lines (mirror PR pass-down).
begin;

alter table public.mfg_work_orders
  add column if not exists source_sales_order_id bigint references public.so_sales_orders(id),
  add column if not exists source_sales_order_line_id bigint references public.so_sales_order_lines(id);

create index if not exists idx_mfg_work_orders_source_so
  on public.mfg_work_orders (source_sales_order_id)
  where source_sales_order_id is not null;

create index if not exists idx_mfg_work_orders_source_so_line
  on public.mfg_work_orders (source_sales_order_line_id)
  where source_sales_order_line_id is not null;

insert into public.doc_generation_rules (tenant_id, name, source_entity, target_entity, field_map, summarize_by, require_confirmed_source)
select t.id, 'Default SO to Work Order', 'sales_order', 'work_order', '{}'::jsonb, array['partner_id']::text[], false
from public.tenants t
on conflict do nothing;

commit;
