-- Tenant-defined custom form fields (definitions + values)
begin;

alter table public.users
  add column if not exists tenant_role varchar(30) not null default 'member'
  check (tenant_role in ('member', 'store_admin'));

create table if not exists public.tenant_custom_field_definitions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  field_key varchar(100) not null,
  label varchar(255) not null,
  field_type text not null check (field_type in (
    'text', 'textarea', 'number', 'select', 'radio', 'checkbox',
    'date', 'date_range', 'number_range'
  )),
  options jsonb not null default '{}'::jsonb,
  is_required boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity_type, field_key)
);

create index if not exists idx_custom_field_defs_tenant_entity
  on public.tenant_custom_field_definitions (tenant_id, entity_type, sort_order)
  where is_active = true;

create table if not exists public.tenant_custom_field_values (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  field_key varchar(100) not null,
  value_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, entity_type, entity_id, field_key)
);

create index if not exists idx_custom_field_values_entity
  on public.tenant_custom_field_values (tenant_id, entity_type, entity_id);

commit;
