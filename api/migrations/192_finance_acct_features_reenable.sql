-- When Accounting Dept (finance) is on, Acct. I / II / AP Review should be on too.
-- Migration 187 seeded these once (on conflict do nothing). Tenants that later toggled
-- finance off→on kept children disabled via cascade, so sidebar only showed /app/finance.
begin;

insert into public.tenant_modules (tenant_id, module_code, is_enabled, enabled_at, disabled_at)
select tm.tenant_id, f.feature_code, true, now(), null
from public.tenant_modules tm
cross join (
  values
    ('finance', 'finance.acct_i'),
    ('finance', 'finance.acct_ii'),
    ('finance', 'finance.payment_vouchers'),
    ('inventory', 'inventory.wms')
) as f(parent_code, feature_code)
where tm.module_code = f.parent_code
  and tm.is_enabled = true
on conflict (tenant_id, module_code) do update
set is_enabled = true,
    enabled_at = now(),
    disabled_at = null
where public.tenant_modules.is_enabled = false;

commit;
