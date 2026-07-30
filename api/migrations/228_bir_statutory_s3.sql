-- Phase S3: Compensation WHT pack — statutory export permissions
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.compensation_wht_read', 'finance', 'compensation_wht_read', 'Compensation WHT packs (read)', 86)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'finance.compensation_wht_read'
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
