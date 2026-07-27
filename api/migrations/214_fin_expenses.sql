-- Purchasing expenses (Zoho-style expense register under Buying).
begin;

create table if not exists public.fin_expenses (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  expense_date date not null default current_date,
  date_seq int not null default 1,
  expense_no varchar(40) not null,
  partner_id bigint references public.inv_partners(id),
  vendor_name varchar(255) not null default '',
  category varchar(100) not null default 'general',
  description text not null default '',
  amount numeric(18,4) not null check (amount >= 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  payment_status varchar(20) not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid')),
  paid_at timestamptz,
  payment_voucher_id bigint,
  reference varchar(255),
  notes text,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, expense_no)
);

create index if not exists idx_fin_expenses_tenant_date
  on public.fin_expenses (tenant_id, expense_date desc)
  where deleted_at is null;

create index if not exists idx_fin_expenses_status
  on public.fin_expenses (tenant_id, payment_status)
  where deleted_at is null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.expenses', 'finance', 'expenses', 'Expenses', 445),
  ('finance.expenses_write', 'finance', 'expenses_write', 'Expenses (write)', 446)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select tr.tenant_id, tr.role_code, pr.permission_code, 'write'
from public.tenant_roles tr
cross join public.permission_registry pr
where tr.role_code in ('owner', 'admin', 'store_admin', 'member')
  and pr.permission_code in ('finance.expenses', 'finance.expenses_write')
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
