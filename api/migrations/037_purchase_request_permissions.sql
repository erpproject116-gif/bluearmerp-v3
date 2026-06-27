-- Purchase Request permissions
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_request', 'purchase_request', null, 'Purchase Request (module)', 260),
  ('purchase_request.purchase_requests_new', 'purchase_request', 'purchase_requests_new', 'New Purchase Request', 270),
  ('purchase_request.purchase_requests', 'purchase_request', 'purchase_requests', 'Purchase Request List', 280),
  ('purchase_request.purchase_requests_status', 'purchase_request', 'purchase_requests_status', 'Purchase Request Status', 290)
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
  'purchase_request',
  'purchase_request.purchase_requests_new',
  'purchase_request.purchase_requests',
  'purchase_request.purchase_requests_status'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'purchase_request',
  'purchase_request.purchase_requests_new',
  'purchase_request.purchase_requests',
  'purchase_request.purchase_requests_status'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
