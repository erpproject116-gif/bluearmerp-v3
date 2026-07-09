-- Phase 3: rename Operations → Project Management; PO status/outstanding report permissions.
begin;

update public.module_registry
set module_name = 'Project Management'
where module_code = 'operations';

update public.permission_registry
set label = 'Project Management (module)'
where permission_code = 'operations';

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_order.purchase_orders_status', 'purchase_order', 'purchase_orders_status', 'Purchase Order Status', 325),
  ('purchase_order.purchase_orders_outstanding', 'purchase_order', 'purchase_orders_outstanding', 'Outstanding PO Status', 326),
  ('shipping_order.shipment_status', 'sales_order', 'shipment_status', 'Shipment Status', 75),
  ('shipping_order.pending_shipment', 'sales_order', 'pending_shipment', 'Pending Shipment', 76),
  ('shipping_order.shipping_order_status', 'sales_order', 'shipping_order_status', 'Shipping Order Status', 77)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, tr.role_code, pr.permission_code, 'write'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'store_admin'
cross join public.permission_registry pr
where pr.permission_code in (
  'purchase_order.purchase_orders_status',
  'purchase_order.purchase_orders_outstanding',
  'shipping_order.shipment_status',
  'shipping_order.pending_shipment',
  'shipping_order.shipping_order_status'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, tr.role_code, pr.permission_code, 'read'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'member'
cross join public.permission_registry pr
where pr.permission_code in (
  'purchase_order.purchase_orders_status',
  'purchase_order.purchase_orders_outstanding',
  'shipping_order.shipment_status',
  'shipping_order.pending_shipment',
  'shipping_order.shipping_order_status'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
