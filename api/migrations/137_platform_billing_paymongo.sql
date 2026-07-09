-- Platform subscription billing: PayMongo checkout, payment history, invoice reminders.
begin;

alter table public.platform_subscription_invoices
  add column if not exists paymongo_checkout_session_id varchar(64),
  add column if not exists paymongo_payment_id varchar(64),
  add column if not exists paymongo_reference varchar(64),
  add column if not exists last_reminder_at date;

create index if not exists idx_platform_subscription_invoices_paymongo_session
  on public.platform_subscription_invoices (paymongo_checkout_session_id)
  where paymongo_checkout_session_id is not null;

create unique index if not exists idx_platform_subscription_invoices_paymongo_payment
  on public.platform_subscription_invoices (paymongo_payment_id)
  where paymongo_payment_id is not null;

create table if not exists public.platform_subscription_payments (
  id bigserial primary key,
  invoice_id bigint not null references public.platform_subscription_invoices(id) on delete cascade,
  subscription_id bigint not null references public.platform_subscriptions(id) on delete cascade,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  amount numeric(18,2) not null,
  currency varchar(3) not null default 'PHP',
  provider text not null default 'paymongo'
    check (provider in ('paymongo', 'manual')),
  provider_payment_id varchar(64),
  provider_checkout_session_id varchar(64),
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed', 'refunded')),
  paid_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_subscription_payments_tenant
  on public.platform_subscription_payments (tenant_id, paid_at desc);

create unique index if not exists idx_platform_subscription_payments_provider
  on public.platform_subscription_payments (provider, provider_payment_id)
  where provider_payment_id is not null;

commit;
