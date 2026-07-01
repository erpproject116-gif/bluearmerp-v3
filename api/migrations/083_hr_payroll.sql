-- Tier C: HR / Payroll MVP — employee master, pay periods, payslips, payroll accrual JE stub.
begin;

insert into public.fin_gl_accounts (account_code, account_name, sort_order) values
  ('5210', 'Salaries Expense', 520),
  ('2120', 'Salaries Payable', 210)
on conflict (account_code) do update
set account_name = excluded.account_name, sort_order = excluded.sort_order;

insert into public.fin_accounts (tenant_id, account_code, account_name, account_type, sort_order)
select t.id, g.account_code, g.account_name,
  case
    when g.account_code like '2%' then 'liability'
    when g.account_code like '5%' then 'expense'
    else 'expense'
  end,
  g.sort_order
from public.tenants t
cross join public.fin_gl_accounts g
where t.status = 'active' and g.account_code in ('5210', '2120')
on conflict (tenant_id, account_code) do nothing;

create table if not exists public.hr_employees (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_no varchar(30) not null,
  full_name varchar(255) not null,
  department varchar(120) not null default '',
  job_title varchar(120) not null default '',
  hire_date date not null default current_date,
  status varchar(20) not null default 'active'
    check (status in ('active', 'inactive', 'terminated')),
  base_salary numeric(18,4) not null default 0 check (base_salary >= 0),
  user_id bigint references public.users(id) on delete set null,
  email varchar(255),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_no)
);

create index if not exists idx_hr_employees_list
  on public.hr_employees (tenant_id, status, full_name);

create table if not exists public.hr_pay_periods (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  period_label varchar(80) not null,
  period_start date not null,
  period_end date not null,
  status varchar(20) not null default 'open'
    check (status in ('open', 'processed', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_start, period_end),
  check (period_end >= period_start)
);

create index if not exists idx_hr_pay_periods_list
  on public.hr_pay_periods (tenant_id, period_start desc);

create table if not exists public.hr_payslips (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  pay_period_id bigint not null references public.hr_pay_periods(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id),
  gross_pay numeric(18,4) not null default 0 check (gross_pay >= 0),
  deductions numeric(18,4) not null default 0 check (deductions >= 0),
  net_pay numeric(18,4) not null default 0 check (net_pay >= 0),
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  journal_entry_id bigint references public.fin_journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pay_period_id, employee_id)
);

create index if not exists idx_hr_payslips_period
  on public.hr_payslips (tenant_id, pay_period_id);

create table if not exists public.hr_payslip_lines (
  id bigserial primary key,
  payslip_id bigint not null references public.hr_payslips(id) on delete cascade,
  line_no int not null,
  line_type varchar(20) not null default 'earning'
    check (line_type in ('earning', 'deduction')),
  description varchar(255) not null default '',
  amount numeric(18,4) not null check (amount >= 0),
  unique (payslip_id, line_no)
);

create index if not exists idx_hr_payslip_lines_payslip
  on public.hr_payslip_lines (payslip_id, line_no);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('hr', 'HR & Payroll', 'tenant', false, true, 40)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('hr', 'finance')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'hr', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('hr', 'hr', null, 'HR & Payroll (module)', 0),
  ('hr.employees', 'hr', 'employees', 'Employees', 10),
  ('hr.employees_new', 'hr', 'employees_new', 'New Employee', 20),
  ('hr.payroll_runs', 'hr', 'payroll_runs', 'Payroll Runs', 30)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'hr'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
