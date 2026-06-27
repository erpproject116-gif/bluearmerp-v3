-- Purchase Order permissions
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_order', 'purchase_order', null, 'Purchase Order (module)', 300),
  ('purchase_order.purchase_orders_new', 'purchase_order', 'purchase_orders_new', 'New Purchase Order', 310),
  ('purchase_order.purchase_orders', 'purchase_order', 'purchase_orders', 'Purchase Order List', 320),
  ('purchase_order.purchase_orders_confirm', 'purchase_order', 'purchase_orders_confirm', 'Confirm Purchase Order', 330)
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
  'purchase_order',
  'purchase_order.purchase_orders_new',
  'purchase_order.purchase_orders',
  'purchase_order.purchase_orders_confirm'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'purchase_order',
  'purchase_order.purchase_orders_new',
  'purchase_order.purchase_orders',
  'purchase_order.purchase_orders_confirm'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
