-- Configurable subscription plan catalog: pricing, tiers, inclusions, promos.
begin;

create table if not exists public.platform_plans (
  id bigserial primary key,
  plan_code varchar(50) not null,
  display_name varchar(255) not null,
  description text not null default '',
  lock_in_months int not null default 0,
  regular_monthly_amount numeric(18,2) not null default 0,
  regular_total_amount numeric(18,2),
  promo_monthly_amount numeric(18,2),
  promo_total_amount numeric(18,2),
  promo_label varchar(255) not null default '',
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  inclusions jsonb not null default '[]'::jsonb,
  is_trial boolean not null default false,
  is_demo boolean not null default false,
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_plans_code_unique unique (plan_code)
);

create index if not exists idx_platform_plans_active
  on public.platform_plans (is_active, sort_order, id);

alter table public.platform_subscriptions
  add column if not exists plan_id bigint references public.platform_plans(id) on delete set null;

-- Default catalog (matches original hard-coded pricing; editable by superadmin).
insert into public.platform_plans (
  plan_code, display_name, description, lock_in_months,
  regular_monthly_amount, regular_total_amount,
  inclusions, is_trial, is_demo, is_public, sort_order
) values
  (
    'trial_90d', '90-day free trial', 'Full workspace, no credit card required.', 0,
    0, null,
    '["Empty workspace for your real data","All ERP modules enabled","90 days full access"]'::jsonb,
    true, false, true, 10
  ),
  (
    'demo', 'Demo sandbox', 'Sample data by industry, ~14 days.', 0,
    0, null,
    '["Industry sample data","All modules preview","Short evaluation period"]'::jsonb,
    false, true, true, 20
  ),
  (
    'standard_6mo', 'Standard — 6-month lock-in', 'Best for teams starting out.', 6,
    2000.00, 12000.00,
    '["Full ERP modules","Email support","6-month minimum term","₱2,000/month billed as ₱12,000 contract"]'::jsonb,
    false, false, true, 30
  ),
  (
    'standard_12mo', 'Standard — 12-month lock-in', 'Best value for committed businesses.', 12,
    1800.00, 21600.00,
    '["Full ERP modules","Priority email support","12-month minimum term","₱1,800/month billed as ₱21,600 contract"]'::jsonb,
    false, false, true, 40
  )
on conflict (plan_code) do nothing;

commit;
