-- HRIS gap-close: leave, absenteeism, discipline, onboarding, performance, lite learning, payroll controls.
begin;

-- ─── Phase A: Leave ─────────────────────────────────────────────────────────
create table if not exists public.hr_leave_types (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(120) not null,
  is_paid boolean not null default true,
  is_cashable boolean not null default true,
  annual_credit numeric(8,2) not null default 0 check (annual_credit >= 0),
  carry_over_cap numeric(8,2) not null default 0 check (carry_over_cap >= 0),
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.hr_leave_balances (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  leave_type_id bigint not null references public.hr_leave_types(id) on delete cascade,
  balance_year int not null,
  opening_balance numeric(8,2) not null default 0,
  accrued numeric(8,2) not null default 0,
  used numeric(8,2) not null default 0,
  reserved numeric(8,2) not null default 0,
  adjusted numeric(8,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_id, leave_type_id, balance_year)
);

create table if not exists public.hr_leave_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  leave_type_id bigint not null references public.hr_leave_types(id),
  date_from date not null,
  date_to date not null,
  days numeric(8,2) not null check (days > 0),
  status varchar(20) not null default 'submitted'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  reason text not null default '',
  reviewer_user_id bigint references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to >= date_from)
);

create index if not exists idx_hr_leave_requests_emp
  on public.hr_leave_requests (tenant_id, employee_id, status, date_from desc);

create table if not exists public.hr_leave_ledger (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  leave_type_id bigint not null references public.hr_leave_types(id),
  balance_year int not null,
  entry_kind varchar(20) not null
    check (entry_kind in ('accrual', 'usage', 'reserve', 'release', 'adjustment', 'cashout')),
  days numeric(8,2) not null,
  leave_request_id bigint references public.hr_leave_requests(id) on delete set null,
  notes text not null default '',
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.hr_leave_types (tenant_id, code, name, is_paid, is_cashable, annual_credit, carry_over_cap, sort_order)
select t.id, v.code, v.name, v.is_paid, v.is_cashable, v.annual_credit, v.carry_over_cap, v.sort_order
from public.tenants t
cross join (values
  ('VL', 'Vacation Leave', true, true, 15.0, 5.0, 10),
  ('SL', 'Sick Leave', true, false, 15.0, 0.0, 20),
  ('EL', 'Emergency Leave', true, false, 3.0, 0.0, 30),
  ('UL', 'Unpaid Leave', false, false, 0.0, 0.0, 40)
) as v(code, name, is_paid, is_cashable, annual_credit, carry_over_cap, sort_order)
where t.status = 'active'
on conflict (tenant_id, code) do nothing;

-- ─── Phase B: Absenteeism ────────────────────────────────────────────────────
alter table public.hr_dtr_entries
  add column if not exists absence_reason varchar(80) not null default '';

create table if not exists public.hr_absence_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  rule_code varchar(40) not null,
  rule_name varchar(120) not null,
  status_filter varchar(20) not null default 'absent'
    check (status_filter in ('absent', 'awol', 'late', 'any')),
  threshold_count int not null default 3 check (threshold_count > 0),
  window_days int not null default 30 check (window_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, rule_code)
);

create table if not exists public.hr_absence_alerts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  rule_id bigint references public.hr_absence_rules(id) on delete set null,
  alert_code varchar(40) not null default 'threshold',
  message text not null,
  occurrence_count int not null default 0,
  window_start date not null,
  window_end date not null,
  status varchar(20) not null default 'open'
    check (status in ('open', 'acknowledged', 'escalated', 'closed')),
  discipline_case_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_absence_alerts_emp
  on public.hr_absence_alerts (tenant_id, employee_id, status, created_at desc);

insert into public.hr_absence_rules (tenant_id, rule_code, rule_name, status_filter, threshold_count, window_days)
select t.id, v.rule_code, v.rule_name, v.status_filter, v.threshold_count, v.window_days
from public.tenants t
cross join (values
  ('ABSENT_3_30', '3 absences in 30 days', 'absent', 3, 30),
  ('AWOL_1_30', '1 AWOL in 30 days', 'awol', 1, 30)
) as v(rule_code, rule_name, status_filter, threshold_count, window_days)
where t.status = 'active'
on conflict (tenant_id, rule_code) do nothing;

-- ─── Phase C: Discipline ─────────────────────────────────────────────────────
create table if not exists public.hr_discipline_cases (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  case_no varchar(40) not null,
  case_type varchar(40) not null
    check (case_type in ('coaching', 'nte', 'written_warning', 'final_warning', 'suspension', 'termination')),
  status varchar(20) not null default 'open'
    check (status in ('open', 'awaiting_explanation', 'under_review', 'decided', 'acknowledged', 'closed', 'cancelled')),
  subject varchar(255) not null default '',
  details text not null default '',
  policy_ref varchar(255) not null default '',
  absence_alert_id bigint references public.hr_absence_alerts(id) on delete set null,
  issued_by_user_id bigint references public.users(id) on delete set null,
  decision_notes text,
  decided_at timestamptz,
  acknowledged_at timestamptz,
  explanation_due date,
  employee_explanation text,
  letter_html text,
  document_id bigint references public.hr_employee_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, case_no)
);

create table if not exists public.hr_discipline_events (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  case_id bigint not null references public.hr_discipline_cases(id) on delete cascade,
  event_type varchar(40) not null,
  notes text not null default '',
  actor_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_discipline_cases_emp
  on public.hr_discipline_cases (tenant_id, employee_id, status, created_at desc);

alter table public.hr_absence_alerts
  drop constraint if exists hr_absence_alerts_discipline_case_id_fkey;
alter table public.hr_absence_alerts
  add constraint hr_absence_alerts_discipline_case_id_fkey
  foreign key (discipline_case_id) references public.hr_discipline_cases(id) on delete set null;

-- Expand 201 doc types for NTE/DA letters (safe add via check recreation if needed).
alter table public.hr_employee_documents drop constraint if exists hr_employee_documents_doc_type_check;
alter table public.hr_employee_documents
  add constraint hr_employee_documents_doc_type_check
  check (doc_type in (
    'resume', 'contract', 'id_gov', 'id_sss', 'id_philhealth', 'id_pagibig', 'id_tin',
    'nbi', 'medical', 'certificate', 'clearance', 'photo', '201_form',
    'nte', 'warning', 'da', 'onboarding', 'review', 'other'
  ));

-- ─── Phase D: Hire onboarding ────────────────────────────────────────────────
create table if not exists public.hr_onboarding_templates (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(120) not null,
  department_filter varchar(120) not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.hr_onboarding_template_tasks (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  template_id bigint not null references public.hr_onboarding_templates(id) on delete cascade,
  task_code varchar(40) not null,
  title varchar(255) not null,
  task_kind varchar(40) not null default 'checklist'
    check (task_kind in ('checklist', 'document', 'acknowledgment', 'complete_course')),
  due_offset_days int not null default 0,
  sort_order int not null default 100,
  course_id bigint,
  unique (template_id, task_code)
);

create table if not exists public.hr_onboarding_cases (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  template_id bigint references public.hr_onboarding_templates(id) on delete set null,
  status varchar(20) not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, employee_id)
);

create table if not exists public.hr_onboarding_tasks (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  case_id bigint not null references public.hr_onboarding_cases(id) on delete cascade,
  task_code varchar(40) not null,
  title varchar(255) not null,
  task_kind varchar(40) not null default 'checklist',
  due_date date,
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'done', 'skipped')),
  completed_at timestamptz,
  course_id bigint,
  sort_order int not null default 100
);

insert into public.hr_onboarding_templates (tenant_id, code, name)
select t.id, 'DEFAULT', 'Standard new-hire onboarding'
from public.tenants t where t.status = 'active'
on conflict (tenant_id, code) do nothing;

insert into public.hr_onboarding_template_tasks (tenant_id, template_id, task_code, title, task_kind, due_offset_days, sort_order)
select tmpl.tenant_id, tmpl.id, v.task_code, v.title, v.task_kind, v.due_offset_days, v.sort_order
from public.hr_onboarding_templates tmpl
cross join (values
  ('PROFILE', 'Complete employee profile & bank details', 'checklist', 1, 10),
  ('DOCS_IDS', 'Upload government IDs (TIN/SSS/PhilHealth/Pag-IBIG)', 'document', 3, 20),
  ('CONTRACT', 'Sign employment contract', 'document', 3, 30),
  ('POLICY', 'Acknowledge company handbook / code of conduct', 'acknowledgment', 7, 40),
  ('ORIENTATION', 'Complete orientation course', 'complete_course', 14, 50)
) as v(task_code, title, task_kind, due_offset_days, sort_order)
where tmpl.code = 'DEFAULT'
on conflict (template_id, task_code) do nothing;

-- ─── Phase E: Performance ────────────────────────────────────────────────────
create table if not exists public.hr_review_templates (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(120) not null,
  sections_json jsonb not null default '[{"key":"overall","label":"Overall performance","max_score":5}]'::jsonb,
  is_active boolean not null default true,
  unique (tenant_id, code)
);

create table if not exists public.hr_review_cycles (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name varchar(120) not null,
  cycle_kind varchar(20) not null default 'annual'
    check (cycle_kind in ('annual', 'quarterly', 'probation', 'ad_hoc')),
  template_id bigint references public.hr_review_templates(id) on delete set null,
  period_start date not null,
  period_end date not null,
  status varchar(20) not null default 'open'
    check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.hr_performance_reviews (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  cycle_id bigint references public.hr_review_cycles(id) on delete set null,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  reviewer_user_id bigint references public.users(id) on delete set null,
  status varchar(20) not null default 'assigned'
    check (status in ('assigned', 'self_done', 'manager_done', 'calibrated', 'acknowledged')),
  self_comments text not null default '',
  manager_comments text not null default '',
  overall_score numeric(6,2),
  scores_json jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  document_id bigint references public.hr_employee_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.hr_review_templates (tenant_id, code, name)
select t.id, 'DEFAULT', 'Standard performance review'
from public.tenants t where t.status = 'active'
on conflict (tenant_id, code) do nothing;

-- ─── Phase F: Lite learning ──────────────────────────────────────────────────
create table if not exists public.hr_courses (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  title varchar(255) not null,
  summary text not null default '',
  body_markdown text not null default '',
  is_mandatory boolean not null default false,
  pass_mark numeric(5,2) not null default 70,
  attempt_limit int not null default 3,
  time_limit_minutes int,
  certificate_valid_days int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.hr_quiz_questions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  course_id bigint not null references public.hr_courses(id) on delete cascade,
  prompt text not null,
  choices_json jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  sort_order int not null default 100
);

create table if not exists public.hr_learning_assignments (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  course_id bigint not null references public.hr_courses(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  due_date date,
  status varchar(20) not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'passed', 'failed', 'expired')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, course_id, employee_id)
);

create table if not exists public.hr_quiz_attempts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  assignment_id bigint not null references public.hr_learning_assignments(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  course_id bigint not null references public.hr_courses(id) on delete cascade,
  score numeric(6,2) not null default 0,
  passed boolean not null default false,
  answers_json jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.hr_learning_completions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  course_id bigint not null references public.hr_courses(id) on delete cascade,
  completed_at timestamptz not null default now(),
  expires_at timestamptz,
  certificate_code varchar(80) not null default '',
  unique (tenant_id, employee_id, course_id, completed_at)
);

-- FK from onboarding template tasks to courses (added after courses exist)
alter table public.hr_onboarding_template_tasks
  drop constraint if exists hr_onboarding_template_tasks_course_id_fkey;
alter table public.hr_onboarding_template_tasks
  add constraint hr_onboarding_template_tasks_course_id_fkey
  foreign key (course_id) references public.hr_courses(id) on delete set null;
alter table public.hr_onboarding_tasks
  drop constraint if exists hr_onboarding_tasks_course_id_fkey;
alter table public.hr_onboarding_tasks
  add constraint hr_onboarding_tasks_course_id_fkey
  foreign key (course_id) references public.hr_courses(id) on delete set null;

insert into public.hr_courses (tenant_id, code, title, summary, body_markdown, is_mandatory, pass_mark)
select t.id, 'ORIENTATION', 'Company orientation',
  'Welcome overview for new hires.',
  E'# Welcome\n\nRead the company handbook summary, then take the quiz.\n\n- Safety basics\n- Code of conduct\n- Timekeeping rules',
  true, 70
from public.tenants t where t.status = 'active'
on conflict (tenant_id, code) do nothing;

insert into public.hr_quiz_questions (tenant_id, course_id, prompt, choices_json, correct_index, sort_order)
select c.tenant_id, c.id, v.prompt, v.choices_json::jsonb, v.correct_index, v.sort_order
from public.hr_courses c
cross join (values
  ('You must clock in/out using approved timekeeping.', '["True","False"]', 0, 10),
  ('Sharing login credentials is allowed.', '["True","False"]', 1, 20),
  ('Who do you ask for leave approvals?', '["Ignore it","Your manager / HR","Customers"]', 1, 30)
) as v(prompt, choices_json, correct_index, sort_order)
where c.code = 'ORIENTATION'
  and not exists (select 1 from public.hr_quiz_questions q where q.course_id = c.id);

update public.hr_onboarding_template_tasks t
set course_id = c.id
from public.hr_courses c
where t.tenant_id = c.tenant_id
  and t.task_code = 'ORIENTATION'
  and c.code = 'ORIENTATION'
  and t.course_id is null;

-- ─── Phase G: Payroll period lock + biometric punch log ──────────────────────
alter table public.hr_pay_periods
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by_user_id bigint references public.users(id) on delete set null;

create table if not exists public.hr_biometric_punches (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  punch_at timestamptz not null,
  punch_type varchar(20) not null default 'in'
    check (punch_type in ('in', 'out', 'break_in', 'break_out')),
  device_id varchar(80) not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_biometric_punches_day
  on public.hr_biometric_punches (tenant_id, employee_id, punch_at);

-- ─── Permissions ─────────────────────────────────────────────────────────────
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('hr.leave', 'hr', 'leave', 'Leave management', 42),
  ('hr.discipline', 'hr', 'discipline', 'Discipline / NTE', 43),
  ('hr.onboarding', 'hr', 'onboarding', 'Employee onboarding', 44),
  ('hr.performance', 'hr', 'performance', 'Performance reviews', 46),
  ('hr.learning', 'hr', 'learning', 'Learning / courses', 47)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('hr.leave', 'hr.discipline', 'hr.onboarding', 'hr.performance', 'hr.learning')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
