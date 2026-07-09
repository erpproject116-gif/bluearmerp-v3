-- Phase 3 Communication Center (Gmail Option C): per-user Gmail connections, synced mail, inbox permissions.
begin;

create table if not exists public.com_gmail_connections (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  google_email varchar(255) not null default '',
  refresh_token text not null default '',
  access_token text,
  token_expires_at timestamptz,
  history_id varchar(64),
  last_sync_at timestamptz,
  sync_status varchar(20) not null default 'idle'
    check (sync_status in ('idle', 'syncing', 'error')),
  sync_error text,
  status varchar(20) not null default 'active'
    check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_com_gmail_connections_tenant
  on public.com_gmail_connections (tenant_id, status);

create table if not exists public.com_mail_messages (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  connection_id bigint references public.com_gmail_connections(id) on delete set null,
  owner_user_id bigint references public.users(id) on delete set null,
  gmail_message_id varchar(255) not null,
  gmail_thread_id varchar(255),
  direction varchar(10) not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  from_addr varchar(500) not null default '',
  to_addrs jsonb not null default '[]'::jsonb,
  cc_addrs jsonb not null default '[]'::jsonb,
  subject varchar(500) not null default '',
  snippet text not null default '',
  body_text text not null default '',
  internal_date timestamptz,
  sent_message_id bigint references public.com_sent_messages(id) on delete set null,
  linked_doc_type varchar(80),
  linked_doc_id bigint,
  is_stub boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (tenant_id, gmail_message_id)
);

create index if not exists idx_com_mail_messages_tenant_date
  on public.com_mail_messages (tenant_id, internal_date desc nulls last);

create index if not exists idx_com_mail_messages_thread
  on public.com_mail_messages (tenant_id, gmail_thread_id);

create index if not exists idx_com_mail_messages_doc
  on public.com_mail_messages (tenant_id, linked_doc_type, linked_doc_id);

create index if not exists idx_com_mail_messages_owner
  on public.com_mail_messages (tenant_id, owner_user_id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('comms.inbox', 'comms', 'inbox', 'View message inbox', 25)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'comms.inbox', 'write'
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', 'comms.inbox', 'read'
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
