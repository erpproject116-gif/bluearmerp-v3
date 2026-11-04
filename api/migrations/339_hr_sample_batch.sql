-- Reversible HR and Payroll sample batch. Retract deletes only ids listed here.
begin;

create table if not exists public.hr_sample_batches (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  retracted_at timestamptz
);

create unique index if not exists uq_hr_sample_batches_open
  on public.hr_sample_batches (tenant_id)
  where retracted_at is null;

create table if not exists public.hr_sample_rows (
  id bigserial primary key,
  batch_id bigint not null references public.hr_sample_batches(id) on delete cascade,
  table_name varchar(80) not null,
  row_id bigint not null
);

create index if not exists idx_hr_sample_rows_batch
  on public.hr_sample_rows (batch_id, table_name);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('hr.sample_data', 'hr', 'sample_data', 'HR sample data', 90)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'hr.sample_data'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
