-- Customer credit limits and enforcement policy flag.
begin;

alter table public.inv_partners
  add column if not exists credit_limit numeric(18,4),
  add column if not exists credit_limit_on_hold boolean not null default false;

alter table public.tenant_process_policies
  add column if not exists sales_enforce_credit_limit boolean not null default false;

commit;
