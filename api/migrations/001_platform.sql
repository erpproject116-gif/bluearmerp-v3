-- Bluearm ERP v3 — platform core
begin;

create extension if not exists "uuid-ossp";

create table if not exists public.tenants (
  id bigserial primary key,
  uuid uuid not null default uuid_generate_v4() unique,
  company_name varchar(255) not null,
  company_code varchar(100) not null unique,
  industry_type varchar(100),
  email varchar(255),
  phone varchar(100),
  address text,
  country varchar(100) default 'PH',
  timezone varchar(100) not null default 'Asia/Manila',
  currency varchar(20) not null default 'PHP',
  status varchar(20) not null default 'active',
  owner_user_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  auth_user_id uuid unique,
  email varchar(320) not null,
  full_name varchar(255) not null,
  status varchar(30) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists public.module_registry (
  id bigserial primary key,
  module_code varchar(50) not null unique,
  module_name varchar(150) not null,
  module_type varchar(30) not null,
  is_core boolean not null default false,
  tenant_enableable boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.module_dependencies (
  id bigserial primary key,
  module_code varchar(50) not null references public.module_registry(module_code) on delete cascade,
  depends_on_module_code varchar(50) not null references public.module_registry(module_code) on delete cascade,
  unique (module_code, depends_on_module_code)
);

create table if not exists public.tenant_modules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  module_code varchar(50) not null references public.module_registry(module_code),
  is_enabled boolean not null default true,
  enabled_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (tenant_id, module_code)
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  actor_user_id bigint references public.users(id) on delete set null,
  action_code varchar(100) not null,
  target_type varchar(100) not null,
  target_id bigint,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_tenant_created on public.audit_logs(tenant_id, created_at desc);

create table if not exists public.tenant_code_sequences (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  last_value integer not null default 0,
  primary key (tenant_id, entity_type)
);

create or replace function public.allocate_tenant_code(
  p_tenant_id bigint,
  p_entity_type text
) returns char(5)
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into public.tenant_code_sequences (tenant_id, entity_type, last_value)
  values (p_tenant_id, p_entity_type, 1)
  on conflict (tenant_id, entity_type)
  do update set last_value = tenant_code_sequences.last_value + 1
  returning last_value into v_next;

  if v_next > 99999 then
    raise exception 'Code limit exceeded for %', p_entity_type;
  end if;

  return lpad(v_next::text, 5, '0');
end;
$$;

create or replace function public.preview_next_tenant_code(
  p_tenant_id bigint,
  p_entity_type text
) returns char(5)
language sql
stable
as $$
  select lpad((coalesce(
    (select last_value from public.tenant_code_sequences
     where tenant_id = p_tenant_id and entity_type = p_entity_type),
    0
  ) + 1)::text, 5, '0');
$$;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values
  ('core', 'Core', 'core', true, false, 0),
  ('inventory', 'Inventory', 'tenant', false, true, 10)
on conflict (module_code) do nothing;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('inventory', 'core')
on conflict do nothing;

commit;
