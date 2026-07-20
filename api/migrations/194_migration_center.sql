-- Migration Center: saved CSV column-map profiles + permissions.
begin;

create table if not exists public.mig_import_profiles (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  kind varchar(20) not null check (kind in ('items', 'partners', 'accounts')),
  name varchar(120) not null,
  column_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind, name)
);

create index if not exists idx_mig_import_profiles_tenant
  on public.mig_import_profiles (tenant_id, kind);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('migration.center', 'user_management', 'migration_center', 'Migration Center', 55)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'migration.center', 'write'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'store_admin'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
