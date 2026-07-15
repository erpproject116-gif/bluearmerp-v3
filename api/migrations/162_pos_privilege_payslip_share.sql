-- POS privilege discounts (PWD/senior strict, student commercial) + F&B tip/table attributes.
-- Payslip secure share tokens for per-employee distribution.
begin;

alter table public.pos_settings
  add column if not exists student_discount_pct numeric(8,4) not null default 10
    check (student_discount_pct >= 0 and student_discount_pct <= 100),
  add column if not exists tip_enabled boolean not null default true,
  add column if not exists privilege_senior_pct numeric(8,4) not null default 20
    check (privilege_senior_pct >= 0 and privilege_senior_pct <= 100),
  add column if not exists privilege_pwd_pct numeric(8,4) not null default 20
    check (privilege_pwd_pct >= 0 and privilege_pwd_pct <= 100);

create table if not exists public.pos_sale_attrs (
  sales_id bigint primary key references public.sa_sales(id) on delete cascade,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  privilege_type varchar(20) not null default 'none'
    check (privilege_type in ('none', 'senior', 'pwd', 'student', 'manual')),
  privilege_id_no varchar(80) not null default '',
  privilege_name varchar(255) not null default '',
  privilege_pct numeric(8,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  tip_amount numeric(18,4) not null default 0,
  table_label varchar(80) not null default '',
  order_type varchar(40) not null default '',
  vat_exempted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_sale_attrs_tenant
  on public.pos_sale_attrs (tenant_id, privilege_type);

create table if not exists public.hr_payslip_share_tokens (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  payslip_id bigint not null references public.hr_payslips(id) on delete cascade,
  token_hash varchar(64) not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz
);

create index if not exists idx_hr_payslip_share_payslip
  on public.hr_payslip_share_tokens (payslip_id)
  where revoked_at is null;

commit;
