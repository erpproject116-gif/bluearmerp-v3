-- Opt-in: completed linked work-order qty may count toward SO release stock eligibility.
begin;

alter table public.tenant_process_policies
  add column if not exists sales_count_completed_wo_toward_release boolean not null default false;

comment on column public.tenant_process_policies.sales_count_completed_wo_toward_release is
  'When true, completed WO qty_produced on linked SO lines counts toward release stock availability. Default off = legacy on-hand only.';

commit;
