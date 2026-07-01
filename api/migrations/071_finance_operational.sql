-- Finance operational accounting: fiscal years, backdated post guard, bank statement placeholder.
begin;

create table if not exists public.fin_fiscal_years (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  year_code varchar(20) not null,
  year_name varchar(100) not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, year_code),
  check (end_date >= start_date)
);

create index if not exists idx_fin_fiscal_years_tenant
  on public.fin_fiscal_years (tenant_id, start_date desc);

insert into public.fin_fiscal_years (tenant_id, year_code, year_name, start_date, end_date, is_active)
select t.id,
  to_char(current_date, 'YYYY'),
  'FY ' || to_char(current_date, 'YYYY'),
  date_trunc('year', current_date)::date,
  (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
  true
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, year_code) do nothing;

alter table public.tenant_process_policies
  add column if not exists accounts_block_backdated_post boolean not null default false;

-- Placeholder bank statement lines for reconciliation matching.
create table if not exists public.fin_bank_statement_lines (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  bank_account_id bigint not null references public.fin_bank_accounts(id) on delete cascade,
  statement_date date not null,
  reference_no varchar(100),
  description text,
  amount numeric(18,4) not null,
  matched_payment_type varchar(20) check (matched_payment_type is null or matched_payment_type in ('official_receipt', 'payment_voucher')),
  matched_payment_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_bank_statement_lines_unmatched
  on public.fin_bank_statement_lines (tenant_id, bank_account_id, statement_date)
  where matched_payment_id is null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.bank_reconciliation', 'finance', 'bank_reconciliation', 'Bank Reconciliation', 90),
  ('finance.payment_entries', 'finance', 'payment_entries', 'Payment Entries', 91),
  ('finance.fiscal_years', 'finance', 'fiscal_years', 'Fiscal Years', 92)
on conflict (permission_code) do nothing;

commit;
