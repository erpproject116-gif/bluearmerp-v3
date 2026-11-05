-- Cross-persona FKs for agency hire loop, bill→sales link, and Emp 201 PIS fields.
begin;

alter table public.hr_job_postings
  add column if not exists manpower_request_id bigint references public.hr_manpower_requests(id) on delete set null;

create index if not exists idx_hr_job_postings_request
  on public.hr_job_postings (tenant_id, manpower_request_id)
  where manpower_request_id is not null;

alter table public.hr_applications
  add column if not exists job_posting_id bigint references public.hr_job_postings(id) on delete set null;

create index if not exists idx_hr_applications_posting
  on public.hr_applications (tenant_id, job_posting_id)
  where job_posting_id is not null;

alter table public.hr_employees
  add column if not exists source_application_id bigint references public.hr_applications(id) on delete set null;

create unique index if not exists uq_hr_employees_source_application
  on public.hr_employees (tenant_id, source_application_id)
  where source_application_id is not null;

alter table public.hr_assignments
  add column if not exists job_order_id bigint references public.hr_job_orders(id) on delete set null;

create index if not exists idx_hr_assignments_job_order
  on public.hr_assignments (tenant_id, job_order_id)
  where job_order_id is not null;

alter table public.hr_client_bills
  add column if not exists sales_id bigint references public.sa_sales(id) on delete set null;

create unique index if not exists uq_hr_client_bills_sales
  on public.hr_client_bills (tenant_id, sales_id)
  where sales_id is not null;

-- Emp 201 PIS fields (copied from application on convert-hire when present).
alter table public.hr_employees
  add column if not exists gender varchar(40) not null default '',
  add column if not exists civil_status varchar(40) not null default '',
  add column if not exists cellphone varchar(40) not null default '',
  add column if not exists city_address text not null default '',
  add column if not exists provincial_address text not null default '',
  add column if not exists birthplace varchar(160) not null default '',
  add column if not exists citizenship varchar(80) not null default '',
  add column if not exists height varchar(40) not null default '',
  add column if not exists weight varchar(40) not null default '',
  add column if not exists religion varchar(80) not null default '',
  add column if not exists spouse_name varchar(160) not null default '',
  add column if not exists spouse_occupation varchar(160) not null default '',
  add column if not exists special_skills text not null default '',
  add column if not exists signature_data_url text not null default '';

commit;
