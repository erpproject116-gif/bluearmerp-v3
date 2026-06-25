-- Ensure custom field tables/columns exist and normalize stored entity types.
begin;

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

alter table public.tenant_custom_field_definitions
  add column if not exists is_active boolean not null default true;

alter table public.tenant_custom_field_definitions
  add column if not exists options jsonb not null default '{}'::jsonb;

alter table public.tenant_custom_field_definitions
  add column if not exists sort_order int not null default 0;

alter table public.tenant_custom_field_definitions
  add column if not exists is_required boolean not null default false;

alter table public.tenant_custom_field_definitions
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.tenant_custom_field_values (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  field_key varchar(100) not null,
  value_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, entity_type, entity_id, field_key)
);

update public.tenant_custom_field_definitions
set entity_type = btrim(entity_type)
where entity_type <> btrim(entity_type);

update public.tenant_custom_field_definitions
set options = coalesce(options, '{}'::jsonb) || jsonb_build_object('is_visible', true)
where is_active = true
  and not (coalesce(options, '{}'::jsonb) ? 'is_visible');

create index if not exists idx_custom_field_defs_tenant_entity
  on public.tenant_custom_field_definitions (tenant_id, entity_type, sort_order)
  where is_active = true;

create index if not exists idx_custom_field_values_entity
  on public.tenant_custom_field_values (tenant_id, entity_type, entity_id);

commit;
