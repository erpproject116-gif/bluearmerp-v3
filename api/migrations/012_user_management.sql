-- User Management module: tenant roles, invites, users.status lifecycle
begin;

-- Extend users.status lifecycle (drop old implicit check if any, add explicit)
alter table public.users drop constraint if exists users_status_check;
alter table public.users
  add constraint users_status_check
  check (status in ('active', 'invited', 'disabled'));

-- tenant_role must remain valid against tenant_roles (FK added after seed)
alter table public.users drop constraint if exists users_tenant_role_check;

create table if not exists public.tenant_roles (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  role_code varchar(50) not null,
  role_name varchar(150) not null,
  description text,
  is_system boolean not null default false,
  can_manage_users boolean not null default false,
  can_manage_form_settings boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, role_code)
);

create index if not exists idx_tenant_roles_tenant on public.tenant_roles (tenant_id, sort_order);

-- Seed system roles for every tenant
insert into public.tenant_roles (
  tenant_id, role_code, role_name, description, is_system,
  can_manage_users, can_manage_form_settings, sort_order
)
select t.id, v.role_code, v.role_name, v.description, true,
  v.can_manage_users, v.can_manage_form_settings, v.sort_order
from public.tenants t
cross join (
  values
    ('member'::varchar, 'Member'::varchar, 'Standard tenant user'::text, false, false, 10),
    ('store_admin'::varchar, 'Store Admin'::varchar, 'Can manage users and form settings'::text, true, true, 20)
) as v(role_code, role_name, description, can_manage_users, can_manage_form_settings, sort_order)
on conflict (tenant_id, role_code) do update
set
  role_name = excluded.role_name,
  description = excluded.description,
  is_system = true,
  can_manage_users = excluded.can_manage_users,
  can_manage_form_settings = excluded.can_manage_form_settings,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.users drop constraint if exists users_tenant_role_fkey;

alter table public.users
  add constraint users_tenant_role_fkey
  foreign key (tenant_id, tenant_role)
  references public.tenant_roles (tenant_id, role_code);

create table if not exists public.user_invites (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  email varchar(320) not null,
  full_name varchar(255) not null,
  role_code varchar(50) not null,
  invited_by_user_id bigint references public.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (tenant_id, email)
);

create index if not exists idx_user_invites_tenant on public.user_invites (tenant_id, invited_at desc);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('user_management', 'User Management', 'tenant', false, true, 5)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('user_management', 'core')
on conflict do nothing;

-- Enable for tenants with auto_enable_all_modules
insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'user_management', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
