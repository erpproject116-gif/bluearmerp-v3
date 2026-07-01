-- User data scopes (ERPNext User Permission inspired).
begin;

create table if not exists public.user_data_scopes (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  scope_type varchar(30) not null
    check (scope_type in ('customer', 'location', 'warehouse')),
  record_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, scope_type, record_id)
);

alter table public.tenant_roles
  add column if not exists apply_user_scopes boolean not null default false;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('user_management.user_permissions', 'user_management', 'user_permissions', 'User Permissions', 45)
on conflict (permission_code) do nothing;

commit;
