-- Business Dashboard module and permissions
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('dashboard', 'dashboard', null, 'Business Dashboard (module)', 50),
  ('dashboard.view', 'dashboard', 'view', 'Dashboard Access', 51),
  ('dashboard.kpis', 'dashboard', 'kpis', 'Dashboard KPIs', 52),
  ('dashboard.charts', 'dashboard', 'charts', 'Dashboard Charts', 53),
  ('dashboard.red_flags', 'dashboard', 'red_flags', 'Dashboard Red Flags', 54),
  ('dashboard.financial_summary', 'dashboard', 'financial_summary', 'Dashboard Financial Summary', 55)
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
  'dashboard', 'dashboard.view', 'dashboard.kpis', 'dashboard.charts',
  'dashboard.red_flags', 'dashboard.financial_summary'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('dashboard', 'Business Dashboard', 'tenant', false, true, 5)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('dashboard', 'inventory'),
  ('dashboard', 'sales'),
  ('dashboard', 'quotation'),
  ('dashboard', 'purchase_order'),
  ('dashboard', 'crm')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'dashboard', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
