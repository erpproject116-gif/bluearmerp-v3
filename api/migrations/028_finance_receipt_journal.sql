-- Finance receipt journal: OR dimensions, bank accounts, GL picklist, journal lines, attachments.
begin;

alter table public.sa_sales
  add column if not exists department_id bigint references public.inv_departments(id);

create index if not exists idx_sa_sales_department
  on public.sa_sales (tenant_id, department_id)
  where deleted_at is null;

alter table public.fin_official_receipts
  add column if not exists location_id bigint references public.inv_locations(id),
  add column if not exists department_id bigint references public.inv_departments(id),
  add column if not exists project_id bigint references public.inv_projects(id),
  add column if not exists pic_user_id bigint references public.users(id),
  add column if not exists updated_by_user_id bigint references public.users(id),
  add column if not exists remark text,
  add column if not exists accounting_slip_no varchar(30),
  add column if not exists comment_details text;

create index if not exists idx_fin_official_receipts_location
  on public.fin_official_receipts (tenant_id, location_id)
  where deleted_at is null;

create index if not exists idx_fin_official_receipts_department
  on public.fin_official_receipts (tenant_id, department_id)
  where deleted_at is null;

create index if not exists idx_fin_official_receipts_created_by
  on public.fin_official_receipts (tenant_id, created_by_user_id)
  where deleted_at is null;

create index if not exists idx_fin_official_receipts_updated_by
  on public.fin_official_receipts (tenant_id, updated_by_user_id)
  where deleted_at is null;

alter table public.fin_receipt_applications
  add column if not exists remark text;

create table if not exists public.fin_gl_accounts (
  account_code varchar(20) primary key,
  account_name varchar(255) not null,
  sort_order int not null default 0
);

insert into public.fin_gl_accounts (account_code, account_name, sort_order) values
  ('1020', 'Cash on Hand', 10),
  ('1023', 'UnionBank - 7610', 20),
  ('1024', 'GCASH - 0013', 30),
  ('1025', 'Security Bank - 4050', 40),
  ('1026', 'BDO - 2888', 50),
  ('1029', 'Checking Accounts', 60),
  ('1030', 'Savings Accounts', 70),
  ('1031', 'Installment Savings', 80),
  ('1064', 'Available-for-Sale Securities', 90),
  ('1071', 'Held-to-Maturity Securities', 100),
  ('1170', 'Undeposited Funds', 110),
  ('2609', 'Short-term Loans', 120),
  ('2611', 'Uncleared Payments', 130),
  ('2939', 'Long-term Loans', 140)
on conflict (account_code) do update
set account_name = excluded.account_name,
    sort_order = excluded.sort_order;

create table if not exists public.fin_bank_accounts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  bank_account_code varchar(50) not null,
  bank_account_name varchar(255) not null,
  gl_account_code varchar(20) not null references public.fin_gl_accounts(account_code),
  keyword varchar(255),
  remark text,
  foreign_currency_code varchar(10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bank_account_code)
);

create index if not exists idx_fin_bank_accounts_tenant
  on public.fin_bank_accounts (tenant_id, bank_account_name)
  where is_active = true;

create table if not exists public.fin_receipt_journal_lines (
  id bigserial primary key,
  official_receipt_id bigint not null references public.fin_official_receipts(id) on delete cascade,
  line_no int not null,
  bank_account_id bigint references public.fin_bank_accounts(id),
  deposit_account_code varchar(50),
  deposit_account_name varchar(255),
  gl_account_code varchar(20),
  gl_account_name varchar(255),
  partner_id bigint references public.inv_partners(id),
  partner_code varchar(50),
  partner_name varchar(255),
  amount numeric(18,4) not null default 0,
  fees numeric(18,4) not null default 0,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (official_receipt_id, line_no)
);

create index if not exists idx_fin_receipt_journal_lines_receipt
  on public.fin_receipt_journal_lines (official_receipt_id, line_no);

create table if not exists public.fin_official_receipt_attachments (
  id bigserial primary key,
  official_receipt_id bigint not null references public.fin_official_receipts(id) on delete cascade,
  file_name varchar(255) not null,
  mime_type varchar(100),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_fin_or_attachments_receipt
  on public.fin_official_receipt_attachments (official_receipt_id);

update public.fin_official_receipts
set accounting_slip_no = 'CR ' || receipt_no
where accounting_slip_no is null or btrim(accounting_slip_no) = '';

commit;
