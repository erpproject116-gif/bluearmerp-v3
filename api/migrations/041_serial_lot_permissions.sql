-- Serial & Lot permissions (inventory sub-branch)
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.serial_lot', 'inventory', 'serial_lot', 'Serial & Lot (sub-branch)', 95),
  ('inventory.serial_registry', 'inventory', 'serial_registry', 'Serial Registry', 96),
  ('inventory.serial_movements', 'inventory', 'serial_movements', 'Serial Movements', 97),
  ('inventory.serial_trace', 'inventory', 'serial_trace', 'Serial Trace', 98),
  ('inventory.serial_receive', 'inventory', 'serial_receive', 'Receive / Scan', 99),
  ('inventory.serial_settings', 'inventory', 'serial_settings', 'Serial & Lot Settings', 100)
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
  'inventory.serial_lot',
  'inventory.serial_registry',
  'inventory.serial_movements',
  'inventory.serial_trace',
  'inventory.serial_receive',
  'inventory.serial_settings'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'inventory.serial_lot',
  'inventory.serial_registry',
  'inventory.serial_movements',
  'inventory.serial_trace',
  'inventory.serial_receive',
  'inventory.serial_settings'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
