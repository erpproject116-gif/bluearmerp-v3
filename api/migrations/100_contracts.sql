-- Contract / progress billing
begin;

create table if not exists public.fin_contracts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  contract_no text not null,
  partner_id bigint not null references public.inv_partners(id),
  title text not null,
  start_date date not null,
  end_date date,
  total_amount numeric(18,4) not null default 0,
  status text not null default 'active',
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, contract_no)
);

create table if not exists public.fin_contract_milestones (
  id bigserial primary key,
  contract_id bigint not null references public.fin_contracts(id) on delete cascade,
  milestone_no int not null,
  description text not null,
  due_date date,
  amount numeric(18,4) not null default 0,
  billed_sale_id bigint references public.sa_sales(id),
  status text not null default 'pending',
  unique (contract_id, milestone_no)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.contract_read', 'finance', 'contract_read', 'Contracts (read)', 88),
  ('finance.contract_write', 'finance', 'contract_write', 'Contracts (write)', 89)
on conflict (permission_code) do nothing;

commit;
