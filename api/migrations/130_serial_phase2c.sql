-- Phase 2C: manual serial registration metadata + serial adjustment permission
begin;

alter table public.inv_serial_units
  add column if not exists project_id bigint references public.inv_projects(id) on delete set null;

create index if not exists idx_inv_serial_units_project
  on public.inv_serial_units (tenant_id, project_id)
  where project_id is not null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.serial_adjustment', 'inventory', 'serial_adjustment', 'Serial Adjustment', 101)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'inventory.serial_adjustment'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'inventory.serial_adjustment'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
