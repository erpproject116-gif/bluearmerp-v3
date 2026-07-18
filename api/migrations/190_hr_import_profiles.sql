-- Saved CSV column-map profiles for employee and DTR imports.

create table if not exists public.hr_import_profiles (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  kind varchar(20) not null check (kind in ('employees', 'dtr')),
  name varchar(120) not null,
  column_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind, name)
);

create index if not exists idx_hr_import_profiles_tenant
  on public.hr_import_profiles (tenant_id, kind);
