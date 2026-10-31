-- Outbound integration webhooks (CRM/booking/ops events) + Migration Center attachment vault (Lane C).
begin;

create table if not exists public.tenant_outbound_webhooks (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  target_url text not null default '',
  signing_secret text not null default '',
  is_active boolean not null default false,
  event_filter jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by_user_id bigint null references public.users(id) on delete set null
);

create table if not exists public.mig_attachment_vault (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  legacy_doc_type varchar(64) not null default '',
  legacy_doc_no varchar(120) not null default '',
  file_name varchar(255) not null,
  content_type varchar(128) not null default 'application/octet-stream',
  byte_size bigint not null default 0,
  checksum_sha256 char(64) not null,
  storage_path text not null,
  linked_entity_type varchar(64) null,
  linked_entity_id bigint null,
  is_orphan boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_user_id bigint null references public.users(id) on delete set null,
  unique (tenant_id, checksum_sha256, file_name)
);

create index if not exists idx_mig_attachment_vault_tenant_legacy
  on public.mig_attachment_vault (tenant_id, legacy_doc_type, legacy_doc_no);

create index if not exists idx_mig_attachment_vault_orphan
  on public.mig_attachment_vault (tenant_id) where is_orphan = true;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('platform.outbound_webhook', 'user_management', 'outbound_webhook', 'Outbound webhooks', 56)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'platform.outbound_webhook', 'write'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'store_admin'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
