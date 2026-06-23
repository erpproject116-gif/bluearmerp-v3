-- Promote After-Sales from an Inventory sub-branch to its own tenant module.
begin;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('after_sales', 'After-Sales', 'tenant', false, true, 32)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    tenant_enableable = excluded.tenant_enableable,
    sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('after_sales', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'after_sales', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select tm.tenant_id, 'after_sales', tm.is_enabled
from public.tenant_modules tm
where tm.module_code = 'inventory'
on conflict (tenant_id, module_code) do update
set is_enabled = excluded.is_enabled;

-- New permission codes (module + features)
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('after_sales', 'after_sales', null, 'After-Sales (module)', 0),
  ('after_sales.repair_orders', 'after_sales', 'repair_orders', 'Repair Order List', 10),
  ('after_sales.repair_orders_new', 'after_sales', 'repair_orders_new', 'New Repair Order', 20),
  ('after_sales.repair_orders_status', 'after_sales', 'repair_orders_status', 'Repair Order Status', 30),
  ('after_sales.register_repair_new', 'after_sales', 'register_repair_new', 'New Repair', 40),
  ('after_sales.register_repair', 'after_sales', 'register_repair', 'Repair List', 50),
  ('after_sales.register_repair_status', 'after_sales', 'register_repair_status', 'Repair Status', 60),
  ('after_sales.register_repair_consumption', 'after_sales', 'register_repair_consumption', 'A/S Consumption Status', 70)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

-- Copy role grants from legacy inventory.after_sales.* codes
insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select trp.tenant_id, trp.role_code,
  replace(trp.permission_code, 'inventory.after_sales', 'after_sales'),
  trp.access_level
from public.tenant_role_permissions trp
where trp.permission_code like 'inventory.after_sales%'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.user_permission_overrides (tenant_id, user_id, permission_code, access_level, updated_at)
select upo.tenant_id, upo.user_id,
  replace(upo.permission_code, 'inventory.after_sales', 'after_sales'),
  upo.access_level, now()
from public.user_permission_overrides upo
where upo.permission_code like 'inventory.after_sales%'
on conflict (tenant_id, user_id, permission_code) do update
set access_level = excluded.access_level, updated_at = now();

insert into public.tenant_user_group_permissions (tenant_id, group_id, permission_code, access_level)
select tugp.tenant_id, tugp.group_id,
  replace(tugp.permission_code, 'inventory.after_sales', 'after_sales'),
  tugp.access_level
from public.tenant_user_group_permissions tugp
where tugp.permission_code like 'inventory.after_sales%'
on conflict (group_id, permission_code) do update
set access_level = excluded.access_level;

-- Technicians group: grant after_sales module (split from inventory-only seed)
insert into public.tenant_user_group_permissions (tenant_id, group_id, permission_code, access_level)
select g.tenant_id, g.id, pr.permission_code, 'write'
from public.tenant_user_groups g
cross join public.permission_registry pr
where g.group_code = 'technicians'
  and pr.module_code = 'after_sales'
on conflict (group_id, permission_code) do update
set access_level = excluded.access_level;

delete from public.permission_registry
where permission_code like 'inventory.after_sales%';

commit;
