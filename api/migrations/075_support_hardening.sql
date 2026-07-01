-- Phase 0: enable support module for tenants that already have CRM enabled.
begin;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select tm.tenant_id, 'support', tm.is_enabled
from public.tenant_modules tm
where tm.module_code = 'crm' and tm.is_enabled = true
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
