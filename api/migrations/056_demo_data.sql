-- Demo data management: in-app populate / purge for demo tenants
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('settings.demo_data', 'core', 'demo_data', 'Demo data populate & purge', 16)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'settings.demo_data', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
