-- Applicant intake, segmentation, pay history, workplace problems, worker requests,
-- and client reports. Does not change payroll, discipline case types, or CRM leads.
begin;

create table if not exists public.hr_applicant_people (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  full_name varchar(255) not null,
  email varchar(255) not null default '',
  mobile varchar(40) not null default '',
  birth_date date,
  tin varchar(40) not null default '',
  sss_no varchar(40) not null default '',
  nbi_no varchar(40) not null default '',
  passport_no varchar(40) not null default '',
  res_cert_no varchar(40) not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_applicant_people_email
  on public.hr_applicant_people (tenant_id, lower(email));

create table if not exists public.hr_applicant_segments (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  kind varchar(20) not null check (kind in ('industry', 'workplace')),
  name varchar(120) not null,
  unique (tenant_id, kind, name)
);

create table if not exists public.hr_applications (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  person_id bigint not null references public.hr_applicant_people(id) on delete restrict,
  status varchar(40) not null default 'pooling'
    check (status in (
      'pooling', 'initial_interview', 'exam', 'final_interview',
      'onboarding', 'hired', 'rejected', 'terminated', 'resigned'
    )),
  position_desired varchar(160) not null default '',
  application_date date,
  gender varchar(40) not null default '',
  city_address text not null default '',
  provincial_address text not null default '',
  telephone varchar(40) not null default '',
  cellphone varchar(40) not null default '',
  email varchar(255) not null default '',
  birth_date date,
  birthplace varchar(160) not null default '',
  civil_status varchar(40) not null default '',
  citizenship varchar(80) not null default '',
  height varchar(40) not null default '',
  weight varchar(40) not null default '',
  religion varchar(80) not null default '',
  spouse_name varchar(160) not null default '',
  spouse_occupation varchar(160) not null default '',
  father_name varchar(160) not null default '',
  father_occupation varchar(160) not null default '',
  mother_name varchar(160) not null default '',
  mother_occupation varchar(160) not null default '',
  languages text not null default '',
  emergency_name varchar(160) not null default '',
  emergency_address text not null default '',
  emergency_phone varchar(40) not null default '',
  elementary_school varchar(160) not null default '',
  elementary_year varchar(10) not null default '',
  high_school varchar(160) not null default '',
  high_school_year varchar(10) not null default '',
  college varchar(160) not null default '',
  college_year varchar(10) not null default '',
  degree_received varchar(160) not null default '',
  special_skills text not null default '',
  res_cert_no varchar(40) not null default '',
  res_cert_issued_at varchar(160) not null default '',
  res_cert_issued_on date,
  sss_no varchar(40) not null default '',
  tin varchar(40) not null default '',
  nbi_no varchar(40) not null default '',
  passport_no varchar(40) not null default '',
  certified boolean not null default false,
  signature_data_url text not null default '',
  industry_id bigint references public.hr_applicant_segments(id) on delete set null,
  workplace_type_id bigint references public.hr_applicant_segments(id) on delete set null,
  custom_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_applications_list
  on public.hr_applications (tenant_id, status, created_at desc);

create table if not exists public.hr_application_children (
  id bigserial primary key,
  application_id bigint not null references public.hr_applications(id) on delete cascade,
  child_name varchar(160) not null,
  birth_date date
);

create table if not exists public.hr_application_jobs (
  id bigserial primary key,
  application_id bigint not null references public.hr_applications(id) on delete cascade,
  company_name varchar(160) not null default '',
  position varchar(160) not null default '',
  started_on date,
  ended_on date
);

create table if not exists public.hr_application_references (
  id bigserial primary key,
  application_id bigint not null references public.hr_applications(id) on delete cascade,
  ref_name varchar(160) not null default '',
  position varchar(160) not null default '',
  company_name varchar(160) not null default '',
  contact_no varchar(40) not null default ''
);

create table if not exists public.hr_application_files (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  application_id bigint not null references public.hr_applications(id) on delete cascade,
  kind varchar(20) not null check (kind in ('selfie', 'id_photo', 'resume')),
  file_name varchar(255) not null,
  mime_type varchar(120) not null default '',
  file_bytes bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_application_comments (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  application_id bigint not null references public.hr_applications(id) on delete cascade,
  body text not null default '',
  file_name varchar(255) not null default '',
  mime_type varchar(120) not null default '',
  file_bytes bytea,
  created_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_compensation_history (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  pay_rate numeric(18,4) not null check (pay_rate >= 0),
  effective_end date not null,
  created_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_compensation_history_emp
  on public.hr_compensation_history (tenant_id, employee_id, effective_end desc);

create table if not exists public.hr_workplace_problems (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  case_no varchar(40) not null,
  employee_id bigint not null references public.hr_employees(id) on delete restrict,
  category varchar(40) not null
    check (category in (
      'attendance', 'performance', 'workplace_conflict', 'payroll', 'employee_complaint',
      'sick_leave', 'client_complaint', 'transfer', 'safety', 'other'
    )),
  priority varchar(20) not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status varchar(30) not null default 'new'
    check (status in (
      'new', 'assigned', 'under_review', 'awaiting_response', 'action_required', 'resolved', 'closed'
    )),
  is_private boolean not null default false,
  description text not null,
  owner_user_id bigint references public.users(id) on delete set null,
  next_action text not null default '',
  target_date date,
  custom_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, case_no)
);

create table if not exists public.hr_workplace_problem_files (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  problem_id bigint not null references public.hr_workplace_problems(id) on delete cascade,
  file_name varchar(255) not null,
  mime_type varchar(120) not null default '',
  file_bytes bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_worker_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  kind varchar(30) not null
    check (kind in ('loan', 'salary_advance', 'pay_question', 'certificate', 'resignation')),
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'closed')),
  details text not null default '',
  custom_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_worker_requests_list
  on public.hr_worker_requests (tenant_id, kind, status, created_at desc);

create table if not exists public.hr_client_violation_reports (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete restrict,
  description text not null,
  status varchar(20) not null default 'waiting'
    check (status in ('waiting')),
  created_at timestamptz not null default now()
);

alter table public.hr_performance_reviews
  add column if not exists review_source varchar(20) not null default 'agency';

alter table public.hr_performance_reviews
  drop constraint if exists hr_performance_reviews_review_source_check;

alter table public.hr_performance_reviews
  add constraint hr_performance_reviews_review_source_check
  check (review_source in ('agency', 'client'));

insert into public.hr_review_templates (tenant_id, code, name, sections_json)
select t.id, 'LMSI_5', 'Five-criterion evaluation',
  '[
    {"key":"attendance_punctuality","label":"Attendance and punctuality","max_score":5},
    {"key":"job_performance","label":"Job performance","max_score":5},
    {"key":"work_attitude","label":"Work attitude and professionalism","max_score":5},
    {"key":"communication","label":"Communication","max_score":5},
    {"key":"following_instructions","label":"Following reasonable work instructions","max_score":5}
  ]'::jsonb
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.hr_review_templates x
    where x.tenant_id = t.id and x.code = 'LMSI_5'
  );

commit;
