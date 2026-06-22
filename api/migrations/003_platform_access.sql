-- Bluearm ERP v3 — platform superadmins + auto-enable future modules
begin;

alter table public.tenants
  add column if not exists auto_enable_all_modules boolean not null default false;

create table if not exists public.platform_users (
  id bigserial primary key,
  auth_user_id uuid not null unique,
  email varchar(320) not null unique,
  full_name varchar(255) not null,
  role varchar(30) not null default 'superadmin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint platform_users_role_check check (role in ('superadmin'))
);

create index if not exists idx_platform_users_email on public.platform_users (lower(email));

-- Enable every module in the registry for a tenant (core + tenant-enableable).
create or replace function public.enable_all_modules_for_tenant(p_tenant_id bigint)
returns void
language plpgsql
as $$
begin
  insert into public.tenant_modules (tenant_id, module_code, is_enabled)
  select p_tenant_id, mr.module_code, true
  from public.module_registry mr
  on conflict (tenant_id, module_code)
  do update set is_enabled = true, disabled_at = null;
end;
$$;

-- When a new module is registered, auto-enable it on tenants flagged for full access.
create or replace function public.trg_auto_enable_module_for_tenants()
returns trigger
language plpgsql
as $$
begin
  insert into public.tenant_modules (tenant_id, module_code, is_enabled)
  select t.id, new.module_code, true
  from public.tenants t
  where t.auto_enable_all_modules = true
    and t.status = 'active'
  on conflict (tenant_id, module_code)
  do update set is_enabled = true, disabled_at = null;
  return new;
end;
$$;

drop trigger if exists trg_module_registry_auto_enable on public.module_registry;
create trigger trg_module_registry_auto_enable
  after insert on public.module_registry
  for each row
  execute function public.trg_auto_enable_module_for_tenants();

commit;
