-- Hide Data Center for now: disable for all tenants and stop tenant toggles.
-- Code/routes remain; re-enable later by setting tenant_enableable = true and enabling per tenant.

update public.module_registry
set tenant_enableable = false,
    module_name = 'Data Center (disabled)'
where module_code = 'data_center';

update public.tenant_modules
set is_enabled = false,
    disabled_at = coalesce(disabled_at, now())
where module_code = 'data_center'
  and is_enabled = true;
