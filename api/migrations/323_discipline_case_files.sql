-- Discipline cases keep their evidence in the 201 file, linked here instead of the case's single document_id.
begin;

create table if not exists public.hr_discipline_case_files (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  case_id bigint not null references public.hr_discipline_cases(id) on delete cascade,
  document_id bigint not null references public.hr_employee_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (case_id, document_id)
);

create index if not exists idx_hr_discipline_case_files_case
  on public.hr_discipline_case_files (tenant_id, case_id);

commit;
