-- Chart of accounts: stop shipping the legacy full pre-filled chart.
-- seed_tenant_chart_of_accounts becomes an alias of the PH SME market template
-- for any remaining callers. New / demo tenants start with an empty chart and
-- import via Finance → Import PH template (seed_ph_sme_chart_of_accounts).
begin;

create or replace function public.seed_tenant_chart_of_accounts(p_tenant bigint)
returns void
language plpgsql
as $$
begin
  perform public.seed_ph_sme_chart_of_accounts(p_tenant);
end;
$$;

comment on function public.seed_tenant_chart_of_accounts(bigint) is
  'Deprecated alias of seed_ph_sme_chart_of_accounts. Prefer Import PH template; do not auto-seed on provision.';

commit;
