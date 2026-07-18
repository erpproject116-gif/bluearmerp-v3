-- Register nav feature codes that previously fell through isTenantFeatureEnabled → always on.
begin;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values
  ('inventory.wms', 'WMS', 'feature', false, true, 13),
  ('finance.acct_i', 'Accounting I', 'feature', false, true, 151),
  ('finance.acct_ii', 'Accounting II', 'feature', false, true, 152),
  ('finance.payment_vouchers', 'AP Review / Payment Vouchers', 'feature', false, true, 153)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    sort_order = excluded.sort_order,
    tenant_enableable = excluded.tenant_enableable;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('inventory.wms', 'inventory'),
  ('finance.acct_i', 'finance'),
  ('finance.acct_ii', 'finance'),
  ('finance.payment_vouchers', 'finance')
on conflict do nothing;

-- Seed enabled for tenants that already have the parent module on
insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select tm.tenant_id, f.feature_code, tm.is_enabled
from public.tenant_modules tm
cross join (
  values
    ('inventory', 'inventory.wms'),
    ('finance', 'finance.acct_i'),
    ('finance', 'finance.acct_ii'),
    ('finance', 'finance.payment_vouchers')
) as f(parent_code, feature_code)
where tm.module_code = f.parent_code and tm.is_enabled = true
on conflict (tenant_id, module_code) do nothing;

commit;
