-- Check register
begin;

create table if not exists public.fin_checks (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  check_no text not null,
  check_date date not null,
  bank_account_id bigint references public.fin_accounts(id),
  payee_name text not null,
  amount numeric(18,4) not null default 0,
  status text not null default 'issued',
  payment_voucher_id bigint,
  cleared_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, check_no)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.check_read', 'finance', 'check_read', 'Check register (read)', 84),
  ('finance.check_write', 'finance', 'check_write', 'Check register (write)', 85)
on conflict (permission_code) do nothing;

commit;
