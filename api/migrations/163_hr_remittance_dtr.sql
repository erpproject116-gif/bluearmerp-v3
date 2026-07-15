-- Remittance batches, holiday calendar, DTR attendance days, related permissions.
begin;

create table if not exists public.hr_remittance_batches (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  pay_period_id bigint not null references public.hr_pay_periods(id) on delete cascade,
  agency varchar(20) not null check (agency in ('sss', 'philhealth', 'pagibig', 'bir')),
  period_label varchar(120) not null default '',
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'ready', 'filed', 'paid')),
  total_employee numeric(18,4) not null default 0,
  total_employer numeric(18,4) not null default 0,
  total_amount numeric(18,4) not null default 0,
  notes text,
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pay_period_id, agency)
);

create index if not exists idx_hr_remittance_batches_list
  on public.hr_remittance_batches (tenant_id, agency, created_at desc);

create table if not exists public.hr_remittance_lines (
  id bigserial primary key,
  batch_id bigint not null references public.hr_remittance_batches(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id),
  employee_no varchar(30) not null default '',
  employee_name varchar(255) not null default '',
  gov_id varchar(40) not null default '',
  ee_amount numeric(18,4) not null default 0,
  er_amount numeric(18,4) not null default 0,
  other_amount numeric(18,4) not null default 0,
  detail jsonb not null default '{}'::jsonb,
  unique (batch_id, employee_id)
);

create index if not exists idx_hr_remittance_lines_batch
  on public.hr_remittance_lines (batch_id);

create table if not exists public.hr_holidays (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  holiday_date date not null,
  name varchar(255) not null,
  holiday_type varchar(40) not null default 'regular'
    check (holiday_type in ('regular', 'special_non_working', 'special_working')),
  pay_multiplier numeric(8,4) not null default 2.0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, holiday_date, name)
);

create index if not exists idx_hr_holidays_date
  on public.hr_holidays (tenant_id, holiday_date);

-- Cut-off definition: which calendar window maps to which payroll label.
create table if not exists public.hr_pay_cutoffs (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  label varchar(80) not null,
  cutoff_start date not null,
  cutoff_end date not null,
  pay_date date,
  status varchar(20) not null default 'open'
    check (status in ('open', 'closed', 'processed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cutoff_end >= cutoff_start),
  unique (tenant_id, cutoff_start, cutoff_end)
);

create table if not exists public.hr_dtr_entries (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  work_date date not null,
  source varchar(20) not null default 'manual'
    check (source in ('manual', 'punch', 'import')),
  status varchar(20) not null default 'present'
    check (status in ('present', 'absent', 'leave', 'holiday', 'rest', 'awol')),
  hours_worked numeric(8,2) not null default 0,
  ot_hours numeric(8,2) not null default 0,
  night_diff_hours numeric(8,2) not null default 0,
  holiday_id bigint references public.hr_holidays(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_id, work_date)
);

create index if not exists idx_hr_dtr_entries_range
  on public.hr_dtr_entries (tenant_id, work_date, employee_id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('hr.remittances', 'hr', 'remittances', 'Remittances', 40),
  ('hr.attendance', 'hr', 'attendance', 'Attendance / DTR', 50)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('hr.remittances', 'hr.attendance')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
