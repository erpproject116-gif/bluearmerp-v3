-- Company GL budget module
begin;

create table if not exists public.fin_budget_headers (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  fiscal_year int not null,
  name text not null,
  status text not null default 'draft',
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, fiscal_year, name)
);

create table if not exists public.fin_budget_lines (
  id bigserial primary key,
  budget_id bigint not null references public.fin_budget_headers(id) on delete cascade,
  account_id bigint not null references public.fin_accounts(id),
  department_id bigint references public.inv_departments(id),
  project_id bigint references public.inv_projects(id),
  period_month date not null,
  amount numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  unique (budget_id, account_id, department_id, project_id, period_month)
);

create table if not exists public.fin_budget_amendments (
  id bigserial primary key,
  budget_line_id bigint not null references public.fin_budget_lines(id) on delete cascade,
  previous_amount numeric(18,4) not null,
  new_amount numeric(18,4) not null,
  reason text,
  amended_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('company_budget', 'Company Budget', 'tenant', false, true, 9)
on conflict (module_code) do update set module_name = excluded.module_name;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.budget_read', 'finance', 'budget_read', 'Company budget (read)', 80),
  ('finance.budget_write', 'finance', 'budget_write', 'Company budget (write)', 81)
on conflict (permission_code) do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'company_budget', false from public.tenants t
on conflict (tenant_id, module_code) do nothing;

commit;
