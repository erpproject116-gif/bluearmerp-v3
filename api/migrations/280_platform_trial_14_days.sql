-- Default free trial length is 14 days; ensure trial_90d catalog row exists.
begin;

alter table public.platform_plans
  add column if not exists trial_days int not null default 0;

insert into public.platform_plans (
  plan_code, display_name, description, lock_in_months,
  regular_monthly_amount, regular_total_amount,
  inclusions, is_trial, is_demo, is_active, is_public, sort_order, trial_days
) values (
  'trial_90d',
  '14-day free trial',
  'Full workspace, no credit card required.',
  0,
  0,
  null,
  '["Empty workspace for your real data","All ERP modules enabled","14 days full access"]'::jsonb,
  true,
  false,
  true,
  true,
  10,
  14
)
on conflict (plan_code) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  inclusions = excluded.inclusions,
  is_trial = true,
  is_demo = false,
  is_active = true,
  trial_days = 14,
  updated_at = now();

commit;
