-- Chart of accounts, journal entries, posting log, auto-post toggles.
begin;

create table if not exists public.fin_accounts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  account_code varchar(20) not null,
  account_name varchar(255) not null,
  account_type varchar(20) not null
    check (account_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id bigint references public.fin_accounts(id),
  is_group boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  unique (tenant_id, account_code)
);

create table if not exists public.fin_journal_entries (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entry_date date not null default current_date,
  date_seq int not null default 1,
  entry_no varchar(30) not null,
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  remarks text,
  posted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entry_no)
);

create table if not exists public.fin_journal_entry_lines (
  id bigserial primary key,
  journal_entry_id bigint not null references public.fin_journal_entries(id) on delete cascade,
  line_no int not null,
  account_id bigint not null references public.fin_accounts(id),
  debit numeric(18,4) not null default 0 check (debit >= 0),
  credit numeric(18,4) not null default 0 check (credit >= 0),
  party_id bigint references public.inv_partners(id),
  remarks text,
  unique (journal_entry_id, line_no)
);

create table if not exists public.fin_posting_log (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  source_type varchar(50) not null,
  source_id bigint not null,
  poster_kind varchar(30) not null default 'audit',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_fin_posting_log_source
  on public.fin_posting_log (tenant_id, source_type, source_id);

alter table public.tenant_process_policies
  add column if not exists accounts_auto_post_or boolean not null default false,
  add column if not exists accounts_auto_post_pv boolean not null default false;

-- Seed default accounts from legacy fin_gl_accounts picklist for each tenant
insert into public.fin_accounts (tenant_id, account_code, account_name, account_type, sort_order)
select t.id, g.account_code, g.account_name,
  case
    when g.account_code like '1%' then 'asset'
    when g.account_code like '2%' then 'liability'
    when g.account_code like '4%' then 'income'
    when g.account_code like '5%' then 'expense'
    else 'asset'
  end,
  g.sort_order
from public.tenants t
cross join public.fin_gl_accounts g
where t.status = 'active'
on conflict (tenant_id, account_code) do nothing;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.journal_entries', 'finance', 'journal_entries', 'Journal Entries', 80),
  ('finance.journal_entries_new', 'finance', 'journal_entries_new', 'New Journal Entry', 81),
  ('finance.journal_entries_post', 'finance', 'journal_entries_post', 'Post Journal Entry', 82)
on conflict (permission_code) do nothing;

commit;
