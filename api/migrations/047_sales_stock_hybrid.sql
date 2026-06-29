-- Hybrid sales stock: serial reservation timestamp + reversal permissions
begin;

alter table public.inv_serial_units
  add column if not exists reserved_at timestamptz;

create index if not exists idx_inv_serial_units_reserved_stale
  on public.inv_serial_units (tenant_id, status, reserved_at)
  where status = 'reserved';

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('sales_order.release_undo', 'sales_order', 'release_undo', 'Undo SO Release', 265),
  ('sales.sales_return', 'sales', 'sales_return', 'Sales Return', 195),
  ('purchase_order.goods_receipts_reverse', 'purchase_order', 'goods_receipts_reverse', 'Reverse Goods Receipt', 360)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'sales_order.release_undo',
  'sales.sales_return',
  'purchase_order.goods_receipts_reverse'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
