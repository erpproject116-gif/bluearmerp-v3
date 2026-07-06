-- Platform customer registry, subscriptions, manual billing, CRM retention task types.
begin;

create table if not exists public.platform_customers (
  id bigserial primary key,
  email varchar(320) not null,
  auth_user_id uuid,
  full_name varchar(255) not null default '',
  company_name varchar(255),
  mobile varchar(20),
  tenant_id bigint references public.tenants(id) on delete set null,
  entry_source text not null default 'self_signup'
    check (entry_source in ('demo_signup', 'self_signup', 'invite', 'google', 'platform_created')),
  crm_lead_tenant_id bigint references public.tenants(id) on delete set null,
  crm_lead_id bigint,
  demo_signup_id bigint references public.demo_signups(id) on delete set null,
  urgency_label text not null default 'new_lead'
    check (urgency_label in (
      'new_lead', 'demo_active', 'demo_expiring_soon', 'demo_expired',
      'trial_active', 'trial_urgent', 'trial_critical', 'trial_expired',
      'subscription_active', 'renewal_due', 'payment_overdue', 'churned'
    )),
  urgency_updated_at timestamptz not null default now(),
  onboarding_progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_platform_customers_email
  on public.platform_customers (lower(email));

create index if not exists idx_platform_customers_tenant
  on public.platform_customers (tenant_id)
  where tenant_id is not null;

create index if not exists idx_platform_customers_urgency
  on public.platform_customers (urgency_label, urgency_updated_at desc);

create table if not exists public.platform_subscriptions (
  id bigserial primary key,
  customer_id bigint not null references public.platform_customers(id) on delete cascade,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  plan_kind text not null
    check (plan_kind in ('demo', 'trial_90d', 'standard_6mo', 'standard_12mo')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'expired', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  lock_in_months int not null default 0,
  monthly_amount numeric(18,2) not null default 0,
  total_contract_amount numeric(18,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_subscriptions_customer
  on public.platform_subscriptions (customer_id, created_at desc);

create index if not exists idx_platform_subscriptions_tenant_active
  on public.platform_subscriptions (tenant_id, status, ends_at)
  where status = 'active';

create table if not exists public.platform_subscription_invoices (
  id bigserial primary key,
  subscription_id bigint not null references public.platform_subscriptions(id) on delete cascade,
  invoice_no varchar(64) not null,
  period_start date not null,
  period_end date not null,
  amount numeric(18,2) not null,
  currency varchar(3) not null default 'PHP',
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid', 'void')),
  marked_paid_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_platform_subscription_invoices_no
  on public.platform_subscription_invoices (subscription_id, invoice_no);

create index if not exists idx_platform_subscription_invoices_due
  on public.platform_subscription_invoices (status, due_date)
  where status = 'issued';

-- CRM retention follow-ups for platform subscription lifecycle.
alter table public.crm_follow_up_tasks
  drop constraint if exists crm_follow_up_tasks_task_type_check;

alter table public.crm_follow_up_tasks
  add constraint crm_follow_up_tasks_task_type_check check (task_type in (
    'warranty_follow_up', 'quote_follow_up', 'manual',
    'subscription_trial_follow_up', 'subscription_renewal_follow_up', 'subscription_payment_follow_up'
  ));

alter table public.crm_follow_up_tasks
  add column if not exists platform_customer_id bigint references public.platform_customers(id) on delete set null;

create index if not exists idx_crm_follow_up_tasks_platform_customer
  on public.crm_follow_up_tasks (tenant_id, platform_customer_id, task_type, due_date)
  where platform_customer_id is not null;

commit;
