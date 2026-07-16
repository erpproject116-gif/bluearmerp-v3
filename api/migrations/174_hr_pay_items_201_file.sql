-- HR Phase 3: pay item catalog, employee recurring assignments, 201 file documents, absence flags.
begin;

-- Tenant catalog of earnings and deductions (beyond hard-coded BASIC/OT/statutory).
create table if not exists public.hr_pay_item_types (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  item_code varchar(40) not null,
  item_name varchar(120) not null,
  item_kind varchar(20) not null
    check (item_kind in ('earning', 'deduction')),
  -- taxable: include in BIR taxable base; include_in_sss: add to compensation for SSS/PHIC/HDMF base
  is_taxable boolean not null default true,
  include_in_sss boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  default_amount numeric(18,4) not null default 0 check (default_amount >= 0),
  sort_order int not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_code)
);

create index if not exists idx_hr_pay_item_types_list
  on public.hr_pay_item_types (tenant_id, item_kind, is_active, sort_order);

-- Recurring / fixed amounts assigned to an employee (allowances, loans, etc.).
create table if not exists public.hr_employee_pay_items (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  pay_item_type_id bigint not null references public.hr_pay_item_types(id) on delete cascade,
  amount numeric(18,4) not null default 0 check (amount >= 0),
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (tenant_id, employee_id, pay_item_type_id, effective_from)
);

create index if not exists idx_hr_employee_pay_items_emp
  on public.hr_employee_pay_items (tenant_id, employee_id, is_active);

-- Employee 201 file — document metadata (binary in object storage later; path/url for now).
create table if not exists public.hr_employee_documents (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  doc_type varchar(40) not null default 'other'
    check (doc_type in (
      'resume', 'contract', 'id_gov', 'id_sss', 'id_philhealth', 'id_pagibig', 'id_tin',
      'nbi', 'medical', 'certificate', 'clearance', 'photo', 'other'
    )),
  title varchar(255) not null,
  file_name varchar(255) not null default '',
  file_url text not null default '',
  mime_type varchar(120) not null default '',
  notes text,
  uploaded_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_employee_documents_emp
  on public.hr_employee_documents (tenant_id, employee_id, doc_type);

-- Special payroll run types (13th month, final pay) — metadata on pay periods.
alter table public.hr_pay_periods
  add column if not exists run_type varchar(30) not null default 'regular'
    check (run_type in ('regular', 'thirteenth', 'final_pay', 'adjustment'));

-- Seed system + common catalog items for every active tenant.
insert into public.hr_pay_item_types (tenant_id, item_code, item_name, item_kind, is_taxable, include_in_sss, is_system, sort_order)
select t.id, v.item_code, v.item_name, v.item_kind, v.is_taxable, v.include_in_sss, true, v.sort_order
from public.tenants t
cross join (values
  ('ALLOW_TRANSPORT', 'Transportation allowance', 'earning', true, false, 10),
  ('ALLOW_MEAL', 'Meal allowance', 'earning', true, false, 20),
  ('ALLOW_COMM', 'Communication allowance', 'earning', true, false, 30),
  ('ALLOW_OTHER', 'Other allowance', 'earning', true, false, 40),
  ('DED_LOAN', 'Salary loan', 'deduction', false, false, 200),
  ('DED_CASH_ADV', 'Cash advance', 'deduction', false, false, 210),
  ('DED_UNIFORM', 'Uniform deduction', 'deduction', false, false, 220),
  ('DED_OTHER', 'Other deduction', 'deduction', false, false, 230)
) as v(item_code, item_name, item_kind, is_taxable, include_in_sss, sort_order)
where t.status = 'active'
on conflict (tenant_id, item_code) do nothing;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('hr.pay_items', 'hr', 'pay_items', 'Pay items catalog', 45),
  ('hr.employee_docs', 'hr', 'employee_docs', 'Employee 201 file', 35),
  ('hr.special_runs', 'hr', 'special_runs', '13th month / final pay', 55)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('hr.pay_items', 'hr.employee_docs', 'hr.special_runs')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
