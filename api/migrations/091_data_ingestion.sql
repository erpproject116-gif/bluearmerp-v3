-- Data Center ingestion MVP
begin;

create table if not exists public.ingestion_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name text not null,
  target_entity text not null,
  match_fields jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingested_documents (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  rule_id bigint references public.ingestion_rules(id) on delete set null,
  source_channel text not null default 'manual',
  raw_payload jsonb not null default '{}'::jsonb,
  parsed_fields jsonb not null default '{}'::jsonb,
  match_status text not null default 'pending',
  matched_entity_id bigint,
  status text not null default 'pending',
  generated_target_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ingested_documents_inbox
  on public.ingested_documents (tenant_id, status, created_at desc);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('data_center', 'Data Center', 'tenant', false, true, 10)
on conflict (module_code) do update set module_name = excluded.module_name;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('data_center.read', 'data_center', 'read', 'Data Center inbox', 0),
  ('data_center.manage', 'data_center', 'manage', 'Data Center rules', 10)
on conflict (permission_code) do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'data_center', false from public.tenants t
on conflict (tenant_id, module_code) do nothing;

commit;
