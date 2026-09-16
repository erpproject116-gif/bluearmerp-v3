-- Paid lock-in catalog: 3 / 6 / 12 month contracts with new monthly rates.
begin;

-- Allow standard_3mo on subscriptions (legacy check only listed 6 / 12).
do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'platform_subscriptions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%plan_kind%'
  loop
    execute format('alter table public.platform_subscriptions drop constraint %I', cname);
  end loop;
end $$;

alter table public.platform_subscriptions
  add constraint platform_subscriptions_plan_kind_check
  check (plan_kind in (
    'demo',
    'trial_90d',
    'standard_3mo',
    'standard_6mo',
    'standard_12mo'
  ));

-- Locked-in contract pricing (monthly × term = contract total):
-- 3 mo: ₱5,500 × 3 = ₱16,500
-- 6 mo: ₱5,200 × 6 = ₱31,200
-- 12 mo: ₱4,600 × 12 = ₱55,200
insert into public.platform_plans (
  plan_code, display_name, description, lock_in_months,
  regular_monthly_amount, regular_total_amount,
  inclusions, is_trial, is_demo, is_active, is_public, sort_order
) values
  (
    'standard_3mo',
    'Standard — 3-month lock-in',
    'Minimum paid lock-in contract. Full workspace for 3 months.',
    3,
    5500.00,
    16500.00,
    '["Full ERP modules","Email support","3-month lock-in contract","₱5,500/month · ₱16,500 total"]'::jsonb,
    false, false, true, true, 28
  ),
  (
    'standard_6mo',
    'Standard — 6-month lock-in',
    'Mid-term lock-in contract for growing teams.',
    6,
    5200.00,
    31200.00,
    '["Full ERP modules","Email support","6-month lock-in contract","₱5,200/month · ₱31,200 total"]'::jsonb,
    false, false, true, true, 30
  ),
  (
    'standard_12mo',
    'Standard — 12-month lock-in',
    'Best-rate lock-in contract for committed businesses.',
    12,
    4600.00,
    55200.00,
    '["Full ERP modules","Priority email support","12-month lock-in contract","₱4,600/month · ₱55,200 total"]'::jsonb,
    false, false, true, true, 40
  )
on conflict (plan_code) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  lock_in_months = excluded.lock_in_months,
  regular_monthly_amount = excluded.regular_monthly_amount,
  regular_total_amount = excluded.regular_total_amount,
  inclusions = excluded.inclusions,
  is_trial = false,
  is_demo = false,
  is_active = true,
  is_public = true,
  sort_order = excluded.sort_order,
  updated_at = now();

commit;
