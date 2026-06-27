-- Optional backfill: create sold inv_serial_units from legacy sa_sales_lines.serial_lot_no
-- Run manually after migration 040. NOT run automatically on deploy.
-- Idempotent per (tenant_id, serial_no).
begin;

insert into public.inv_serial_units (
  tenant_id, item_id, serial_no, status, partner_id,
  sales_line_id, warranty_start, warranty_end, received_at
)
select distinct on (s.tenant_id, trim(serial))
  s.tenant_id,
  ln.item_id,
  trim(serial),
  'sold',
  s.partner_id,
  ln.id,
  s.order_date,
  (s.order_date + make_interval(months => coalesce(i.warranty_duration_months, 0)))::date,
  s.order_date::timestamptz
from public.sa_sales_lines ln
join public.sa_sales s on s.id = ln.sales_id
join public.inv_items i on i.id = ln.item_id
cross join lateral unnest(
  string_to_array(replace(coalesce(ln.serial_lot_no, ''), ' ', ''), ',')
) as serial
where coalesce(ln.serial_lot_no, '') <> ''
  and ln.item_id is not null
  and coalesce(i.warranty_duration_months, 0) > 0
  and trim(serial) <> ''
  and not exists (
    select 1 from public.inv_serial_units su
    where su.tenant_id = s.tenant_id and su.serial_no = trim(serial) and su.status <> 'void'
  );

insert into public.inv_serial_events (tenant_id, serial_unit_id, event_type, ref_type, ref_id)
select su.tenant_id, su.id, 'sold', 'sa_sales_line', su.sales_line_id
from public.inv_serial_units su
where su.status = 'sold'
  and su.sales_line_id is not null
  and not exists (
    select 1 from public.inv_serial_events e
    where e.serial_unit_id = su.id and e.event_type = 'sold'
  );

commit;
