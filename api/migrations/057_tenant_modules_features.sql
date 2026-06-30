-- Module & Features admin, sub-branch registry, purchase defaults, SO line reservation qty
begin;

-- Sub-branch / feature module codes (toggle independently under parent)
insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values
  ('inventory.serial_lot', 'Serial & Lot', 'feature', false, true, 11),
  ('quotation.tax_mngt', 'Tax Management', 'feature', false, true, 21),
  ('sales.collective_invoicing', 'Collective Invoicing (Sales)', 'feature', false, true, 141)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('inventory.serial_lot', 'inventory'),
  ('quotation.tax_mngt', 'quotation'),
  ('sales.collective_invoicing', 'sales')
on conflict do nothing;

-- Purchase order no longer requires purchase request module
delete from public.module_dependencies
where module_code = 'purchase_order' and depends_on_module_code = 'purchase_request';

-- Default: purchase request off; purchase order on for active tenants
insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'purchase_order', true
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

update public.tenant_modules
set is_enabled = false, disabled_at = now()
where module_code = 'purchase_request';

-- Enable feature modules for tenants that already have parent modules enabled
insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select tm.tenant_id, f.feature_code, tm.is_enabled
from public.tenant_modules tm
cross join (
  values
    ('inventory', 'inventory.serial_lot'),
    ('quotation', 'quotation.tax_mngt'),
    ('sales', 'sales.collective_invoicing')
) as f(parent_code, feature_code)
where tm.module_code = f.parent_code and tm.is_enabled = true
on conflict (tenant_id, module_code) do nothing;

-- Track per-line SO reservation (split release + auto-reserve on SO save)
alter table public.so_sales_order_lines
  add column if not exists qty_reserved numeric(18,4) not null default 0
    check (qty_reserved >= 0);

-- Permission: Module & Features settings
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('settings.tenant_modules', 'core', 'tenant_modules', 'Module & feature enablement', 17)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'settings.tenant_modules', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
