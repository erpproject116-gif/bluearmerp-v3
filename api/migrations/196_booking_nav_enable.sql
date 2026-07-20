-- Ensure Booking module is visible/enabled for all active tenants after nav wiring.
begin;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('booking', 'Booking', 'module', false, true, 95)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    sort_order = excluded.sort_order,
    tenant_enableable = excluded.tenant_enableable;

insert into public.tenant_modules (tenant_id, module_code, is_enabled, enabled_at, disabled_at)
select t.id, 'booking', true, now(), null
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true,
    enabled_at = coalesce(public.tenant_modules.enabled_at, now()),
    disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('booking.bookings', 'booking', 'bookings', 'Bookings', 10),
  ('booking.bookings_new', 'booking', 'bookings_new', 'Create bookings', 11),
  ('booking.resources', 'booking', 'resources', 'Booking resources', 20),
  ('booking.services', 'booking', 'services', 'Booking services', 30)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'store_admin'
cross join public.permission_registry pr
where pr.module_code = 'booking'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
