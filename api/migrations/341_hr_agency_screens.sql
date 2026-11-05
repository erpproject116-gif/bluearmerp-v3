-- Job orders, manpower requests, client time, client bills, clearance, and document expiry.
-- Client time is not written into hr_dtr_entries. A bill does not write sa_sales.
-- A job order does not change hr_employees.base_salary.
begin;

create table if not exists public.hr_job_orders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  site_id bigint not null references public.hr_client_sites(id) on delete restrict,
  pay_rate numeric(18,4) not null check (pay_rate >= 0),
  bill_rate numeric(18,4) not null check (bill_rate >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_job_orders_site
  on public.hr_job_orders (tenant_id, site_id, id desc);

create table if not exists public.hr_manpower_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  site_id bigint not null references public.hr_client_sites(id) on delete restrict,
  headcount int not null check (headcount > 0),
  details text not null default '',
  status varchar(20) not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.hr_client_time_submissions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  site_id bigint not null references public.hr_client_sites(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  status varchar(20) not null default 'submitted' check (status in ('submitted', 'accepted')),
  file_name varchar(255) not null default '',
  file_bytes bytea,
  accepted_hours numeric(12,2),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (accepted_hours is null or accepted_hours >= 0)
);

create table if not exists public.hr_client_bills (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  site_id bigint not null references public.hr_client_sites(id) on delete restrict,
  submission_id bigint not null references public.hr_client_time_submissions(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  total numeric(18,4) not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, submission_id)
);

create table if not exists public.hr_clearances (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete restrict,
  status varchar(20) not null default 'pending' check (status in ('pending', 'released')),
  pay_period_id bigint references public.hr_pay_periods(id),
  created_at timestamptz not null default now()
);

alter table public.hr_employee_documents
  add column if not exists expires_on date;

commit;
