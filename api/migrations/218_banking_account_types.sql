-- Banking accounts: support banks, credit cards, and e-wallets (GCash, Maya, PayPal, etc.)

alter table public.fin_bank_accounts
  add column if not exists account_type text not null default 'bank'
    check (account_type in ('bank', 'credit_card', 'e_wallet')),
  add column if not exists institution_name varchar(255) not null default '',
  add column if not exists account_number varchar(100) not null default '';

create index if not exists idx_fin_bank_accounts_type
  on public.fin_bank_accounts (tenant_id, account_type)
  where is_active = true;
