-- Repair Order Status report: line remark + list index
begin;

alter table public.inv_repair_order_lines
  add column if not exists remark varchar(500);

create index if not exists idx_repair_orders_status_report
  on public.inv_repair_orders (tenant_id, order_date desc, id)
  where deleted_at is null;

commit;
