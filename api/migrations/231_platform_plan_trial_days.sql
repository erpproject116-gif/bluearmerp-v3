-- Configurable trial length on platform plans; default free trial becomes 30 days.
begin;

alter table public.platform_plans
  add column if not exists trial_days int not null default 0;

update public.platform_plans
set
  trial_days = 30,
  display_name = '30-day free trial',
  description = 'Full workspace, no credit card required.',
  inclusions = '["Empty workspace for your real data","All ERP modules enabled","30 days full access"]'::jsonb,
  updated_at = now()
where plan_code = 'trial_90d'
  and (trial_days = 0 or trial_days = 90 or display_name ilike '%90%');

commit;
