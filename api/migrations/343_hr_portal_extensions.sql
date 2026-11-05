-- Portal reads, in-app notices, job postings, application drafts,
-- a client leave decision, and employee punches.
-- A punch does not write hr_dtr_entries. A client decision does not approve leave.
begin;

alter table public.hr_employee_documents
  add column if not exists client_visible boolean not null default false;

alter table public.hr_leave_requests
  add column if not exists client_decision varchar(20) not null default 'pending';

alter table public.hr_leave_requests
  drop constraint if exists hr_leave_requests_client_decision_check;

alter table public.hr_leave_requests
  add constraint hr_leave_requests_client_decision_check
  check (client_decision in ('pending', 'accepted', 'refused'));

alter table public.hr_leave_requests
  add column if not exists client_decision_note text not null default '';

alter table public.hr_employees
  add column if not exists punch_pin_hash text;

alter table public.hr_employees
  add column if not exists punch_pin_fails int not null default 0;

create table if not exists public.hr_portal_notices (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  partner_id bigint not null references public.inv_partners(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_portal_notices_partner
  on public.hr_portal_notices (tenant_id, partner_id, id desc);

create table if not exists public.hr_portal_activity (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  partner_id bigint not null references public.inv_partners(id) on delete cascade,
  portal_user_id bigint not null references public.portal_users(id) on delete cascade,
  action varchar(40) not null,
  target_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_portal_activity_partner
  on public.hr_portal_activity (tenant_id, partner_id, id desc);

create table if not exists public.hr_job_postings (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  site_id bigint not null references public.hr_client_sites(id) on delete restrict,
  title varchar(200) not null,
  headcount int not null check (headcount > 0),
  status varchar(20) not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.hr_application_drafts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  token_hash varchar(64) not null,
  form_json jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, token_hash)
);

create table if not exists public.hr_time_punches (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete cascade,
  punched_at timestamptz not null default now(),
  selfie_name varchar(255) not null default '',
  selfie_bytes bytea,
  idempotency_key varchar(80) not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, employee_id, idempotency_key)
);

commit;
