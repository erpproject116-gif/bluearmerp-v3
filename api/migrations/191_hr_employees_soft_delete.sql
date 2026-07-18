-- Soft-delete / restore metadata for HR employees.
begin;

alter table public.hr_employees
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id bigint references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id),
  add column if not exists restore_reason text,
  add column if not exists lifecycle_version int not null default 0;

create index if not exists idx_hr_employees_deleted
  on public.hr_employees (tenant_id, deleted_at desc) where deleted_at is not null;

create index if not exists idx_hr_employees_active_list
  on public.hr_employees (tenant_id, full_name) where deleted_at is null;

commit;
