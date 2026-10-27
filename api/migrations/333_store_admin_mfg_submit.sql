-- Restore store_admin manufacturing release/complete submit flags (see migration 080).
-- SeedTenantDefaults grants write but does not set can_submit; reseed/role edits left these false.
begin;

update public.tenant_role_permissions
set can_submit = true
where role_code = 'store_admin'
  and permission_code in (
    'manufacturing.work_orders_release',
    'manufacturing.work_orders_complete'
  )
  and can_submit is distinct from true;

commit;
