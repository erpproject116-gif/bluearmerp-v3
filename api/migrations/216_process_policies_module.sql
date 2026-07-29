-- Process Policies as a tenant-enableable module (global enforcement on/off).
-- When disabled, transaction gates (require quote/SO/PR/attachments/approvals/budget) are bypassed.
-- Stored toggle values are preserved and resume when the module is turned back on.
begin;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('process_policies', 'Process Policies', 'tenant', false, true, 16)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    is_core = excluded.is_core,
    tenant_enableable = excluded.tenant_enableable,
    sort_order = excluded.sort_order;

-- Default ON for every active tenant (opt-out). New tenants get it via provision (all tenant_enableable).
insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'process_policies', true
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, module_code) do nothing;

commit;
