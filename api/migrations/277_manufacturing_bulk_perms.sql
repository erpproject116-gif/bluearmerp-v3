-- Go-Live-F: manufacturing bulk action permissions.
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('manufacturing.boms_bulk', 'manufacturing', 'boms_bulk', 'Bulk deactivate BOMs', 15),
  ('manufacturing.work_orders_bulk', 'manufacturing', 'work_orders_bulk', 'Bulk work order actions', 25)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('manufacturing.boms_bulk', 'manufacturing.work_orders_bulk')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
