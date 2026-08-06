-- Day 1 commercial unlock: paywall after stocks setup; platform confirms GCash manually.
begin;

alter table public.platform_customers
  add column if not exists commercial_status text not null default 'unlocked',
  add column if not exists day1_completed_at timestamptz,
  add column if not exists day1_snapshot jsonb,
  add column if not exists payment_requested_at timestamptz,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists payment_confirmed_by_user_id bigint,
  add column if not exists payment_note text,
  add column if not exists paywall_amount_centavos int not null default 450000;

alter table public.platform_customers
  drop constraint if exists platform_customers_commercial_status_check;

alter table public.platform_customers
  add constraint platform_customers_commercial_status_check
  check (commercial_status in ('setup', 'awaiting_payment', 'unlocked', 'cancelled'));

-- Existing customers stay unlocked so production is not bricked.
update public.platform_customers
set commercial_status = 'unlocked'
where commercial_status is distinct from 'unlocked'
  and commercial_status not in ('setup', 'awaiting_payment', 'cancelled');

-- Any row that somehow lacks a value (defensive).
update public.platform_customers
set commercial_status = 'unlocked'
where commercial_status is null or commercial_status = '';

create index if not exists idx_platform_customers_commercial_day1
  on public.platform_customers (commercial_status, day1_completed_at desc nulls last);

commit;
