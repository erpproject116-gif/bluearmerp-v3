-- Per-tenant overrides for standard (built-in) form fields on create/edit modals
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

commit;
