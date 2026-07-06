-- Idempotent repair for environments that missed early form-field migrations.
begin;

create table if not exists public.tenant_standard_field_settings (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  field_key varchar(100) not null,
  label_override varchar(255),
  is_visible boolean not null default true,
  is_required boolean not null default false,
  is_disabled boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, entity_type, field_key)
);

create index if not exists idx_standard_field_settings_entity
  on public.tenant_standard_field_settings (tenant_id, entity_type, sort_order);

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
  add column if not exists options jsonb not null default '{}'::jsonb;

alter table public.tenant_custom_field_definitions
  add column if not exists is_active boolean not null default true;

update public.tenant_custom_field_definitions
set options = coalesce(options, '{}'::jsonb)
where options is null;

commit;
