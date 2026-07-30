-- Banking polish: opening balances + transfers between accounts

alter table public.fin_bank_accounts
  add column if not exists opening_balance numeric(18,4) not null default 0,
  add column if not exists opening_balance_date date;

create table if not exists public.fin_bank_transfers (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  transfer_date date not null default current_date,
  from_bank_account_id bigint not null references public.fin_bank_accounts(id),
  to_bank_account_id bigint not null references public.fin_bank_accounts(id),
  amount numeric(18,4) not null check (amount > 0),
  reference_no varchar(100) not null default '',
  notes text not null default '',
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_bank_account_id <> to_bank_account_id)
);

create index if not exists idx_fin_bank_transfers_tenant_date
  on public.fin_bank_transfers (tenant_id, transfer_date desc)
  where deleted_at is null;

create index if not exists idx_fin_bank_transfers_from
  on public.fin_bank_transfers (from_bank_account_id)
  where deleted_at is null;

create index if not exists idx_fin_bank_transfers_to
  on public.fin_bank_transfers (to_bank_account_id)
  where deleted_at is null;
