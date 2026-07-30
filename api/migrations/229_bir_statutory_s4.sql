-- Phase S4: Books of accounts + year-end — attachment vault + closing audit
begin;

alter table public.tenant_finance_defaults
  add column if not exists cas_file_url text,
  add column if not exists atp_file_url text,
  add column if not exists retained_earnings_account_id bigint references public.fin_accounts(id) on delete set null;

create table if not exists public.fin_year_end_closings (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  fiscal_year_id bigint not null references public.fin_fiscal_years(id) on delete cascade,
  journal_entry_id bigint references public.fin_journal_entries(id) on delete set null,
  retained_earnings_account_id bigint references public.fin_accounts(id) on delete set null,
  total_income numeric(18,4) not null default 0,
  total_expense numeric(18,4) not null default 0,
  net_income numeric(18,4) not null default 0,
  periods_locked boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_user_id bigint references public.users(id),
  unique (tenant_id, fiscal_year_id)
);

create index if not exists idx_fin_year_end_closings_tenant
  on public.fin_year_end_closings (tenant_id, fiscal_year_id desc);

commit;
