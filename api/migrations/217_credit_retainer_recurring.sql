-- Credit notes, retainer invoices, recurring invoices (Zoho-style Sales docs).
begin;

-- ── Credit notes (AR credit memo; convert remaining to cash refund) ──────────
create table if not exists public.fin_credit_notes (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  credit_date date not null default current_date,
  date_seq int not null default 1,
  credit_no varchar(40) not null,
  partner_id bigint references public.inv_partners(id),
  customer_name varchar(255) not null default '',
  source_sales_id bigint references public.sa_sales(id) on delete set null,
  amount_total numeric(18,4) not null check (amount_total >= 0),
  remaining_amount numeric(18,4) not null check (remaining_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'applied', 'refunded', 'cancelled')),
  reason text not null default '',
  notes text not null default '',
  refunded_at timestamptz,
  refund_method varchar(40),
  refund_reference varchar(255),
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, credit_no)
);

create index if not exists idx_fin_credit_notes_tenant_date
  on public.fin_credit_notes (tenant_id, credit_date desc)
  where deleted_at is null;

create table if not exists public.fin_credit_note_applications (
  id bigserial primary key,
  credit_note_id bigint not null references public.fin_credit_notes(id) on delete cascade,
  sales_id bigint not null references public.sa_sales(id),
  applied_amount numeric(18,4) not null check (applied_amount > 0),
  created_at timestamptz not null default now(),
  unique (credit_note_id, sales_id)
);

-- ── Retainer invoices (customer down payment / advance) ──────────────────────
create table if not exists public.fin_retainer_invoices (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  retainer_date date not null default current_date,
  date_seq int not null default 1,
  retainer_no varchar(40) not null,
  partner_id bigint references public.inv_partners(id),
  customer_name varchar(255) not null default '',
  amount_total numeric(18,4) not null check (amount_total >= 0),
  remaining_amount numeric(18,4) not null check (remaining_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'applied', 'refunded', 'cancelled')),
  notes text not null default '',
  official_receipt_id bigint references public.fin_official_receipts(id) on delete set null,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, retainer_no)
);

create index if not exists idx_fin_retainer_invoices_tenant_date
  on public.fin_retainer_invoices (tenant_id, retainer_date desc)
  where deleted_at is null;

create table if not exists public.fin_retainer_applications (
  id bigserial primary key,
  retainer_id bigint not null references public.fin_retainer_invoices(id) on delete cascade,
  sales_id bigint not null references public.sa_sales(id),
  applied_amount numeric(18,4) not null check (applied_amount > 0),
  created_at timestamptz not null default now(),
  unique (retainer_id, sales_id)
);

-- ── Recurring invoices (subscription schedule → generate Sales) ──────────────
create table if not exists public.fin_recurring_invoices (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name varchar(255) not null,
  partner_id bigint references public.inv_partners(id),
  customer_name varchar(255) not null default '',
  description text not null default '',
  amount numeric(18,4) not null check (amount >= 0),
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_date date not null,
  end_date date,
  is_active boolean not null default true,
  last_sales_id bigint references public.sa_sales(id) on delete set null,
  last_run_at timestamptz,
  notes text not null default '',
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_fin_recurring_invoices_tenant_active
  on public.fin_recurring_invoices (tenant_id, is_active, next_run_date)
  where deleted_at is null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.credit_notes', 'finance', 'credit_notes', 'Credit Notes', 450),
  ('finance.credit_notes_write', 'finance', 'credit_notes_write', 'Credit Notes (write)', 451),
  ('finance.retainers', 'finance', 'retainers', 'Retainer Invoices', 452),
  ('finance.retainers_write', 'finance', 'retainers_write', 'Retainer Invoices (write)', 453),
  ('finance.recurring_invoices', 'finance', 'recurring_invoices', 'Recurring Invoices', 454),
  ('finance.recurring_invoices_write', 'finance', 'recurring_invoices_write', 'Recurring Invoices (write)', 455)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select tr.tenant_id, tr.role_code, pr.permission_code, 'write'
from public.tenant_roles tr
cross join public.permission_registry pr
where tr.role_code in ('owner', 'admin', 'store_admin', 'member')
  and pr.permission_code in (
    'finance.credit_notes', 'finance.credit_notes_write',
    'finance.retainers', 'finance.retainers_write',
    'finance.recurring_invoices', 'finance.recurring_invoices_write'
  )
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
