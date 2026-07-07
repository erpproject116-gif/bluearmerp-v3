-- Foundation setup: explicit acknowledgment of seeded defaults (company, tax, location, policies).
-- Existing workspaces with master data are backfilled so go-live tenants are not blocked.

begin;

comment on column public.platform_customers.onboarding_progress is
  'JSON progress: completed steps, chart_of_accounts_ack, company_ack, currency_tax_ack, location_ack, process_policies_ack, etc.';

update public.platform_customers pc
set onboarding_progress = coalesce(pc.onboarding_progress, '{}'::jsonb) || jsonb_build_object(
      'company_ack', true,
      'currency_tax_ack', true,
      'location_ack', true,
      'process_policies_ack', true,
      'chart_of_accounts_ack', true
    ),
    updated_at = now()
where pc.tenant_id is not null
  and exists (
    select 1
    from public.inv_items i
    where i.tenant_id = pc.tenant_id and i.deleted_at is null
  )
  and exists (
    select 1
    from public.inv_partners p
    where p.tenant_id = pc.tenant_id and p.deleted_at is null
  );

commit;
