-- Leave notes and files, absenteeism remarks and files, company records,
-- and discipline penalty amounts. Penalty amounts do not enter payroll by themselves.

alter table public.hr_leave_requests
  add column if not exists notes text not null default '';

create table if not exists public.hr_leave_request_files (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  leave_request_id bigint not null references public.hr_leave_requests(id) on delete cascade,
  document_id bigint not null references public.hr_employee_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (leave_request_id, document_id)
);

alter table public.hr_absence_alerts
  add column if not exists reason text not null default '',
  add column if not exists remarks text not null default '';

create table if not exists public.hr_absence_alert_files (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  alert_id bigint not null references public.hr_absence_alerts(id) on delete cascade,
  document_id bigint not null references public.hr_employee_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (alert_id, document_id)
);

alter table public.hr_dtr_entries
  add column if not exists absence_remarks text not null default '';

create table if not exists public.hr_company_records (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  record_kind varchar(20) not null
    check (record_kind in ('policy', 'announcement', 'event')),
  title varchar(200) not null,
  body text not null default '',
  record_date date,
  status varchar(20) not null default 'active'
    check (status in ('active', 'archived')),
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_company_records_kind
  on public.hr_company_records (tenant_id, record_kind, status, record_date desc);

alter table public.hr_discipline_cases
  add column if not exists penalty_amount numeric(18,4),
  add column if not exists authority_to_deduct boolean not null default false;
