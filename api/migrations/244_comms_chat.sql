-- Native Team Chat under Communications (tenant-scoped channels / GC / DM).
begin;

-- Allow chat mentions to feed the CRM notification bell.
alter table public.crm_notifications
  drop constraint if exists crm_notifications_source_check;

alter table public.crm_notifications
  add constraint crm_notifications_source_check
  check (source in ('activity', 'rule', 'support', 'system', 'chat'));

create table if not exists public.chat_channels (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  type varchar(20) not null check (type in ('channel', 'group', 'dm')),
  name varchar(120) not null default '',
  topic text not null default '',
  is_private boolean not null default false,
  dm_key varchar(64),
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists uq_chat_channels_dm_key
  on public.chat_channels (tenant_id, dm_key)
  where type = 'dm' and dm_key is not null;

create index if not exists idx_chat_channels_tenant_type
  on public.chat_channels (tenant_id, type, archived_at nulls first, id desc);

create table if not exists public.chat_channel_members (
  channel_id bigint not null references public.chat_channels(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  role varchar(20) not null default 'member' check (role in ('member', 'admin')),
  last_read_message_id bigint,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists idx_chat_channel_members_user
  on public.chat_channel_members (user_id, channel_id);

create table if not exists public.chat_messages (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  channel_id bigint not null references public.chat_channels(id) on delete cascade,
  sender_user_id bigint references public.users(id) on delete set null,
  body text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_chat_messages_channel_id
  on public.chat_messages (tenant_id, channel_id, id desc);

create table if not exists public.chat_message_mentions (
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  primary key (message_id, user_id)
);

create table if not exists public.chat_message_links (
  id bigserial primary key,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  entity_type varchar(80) not null,
  entity_id bigint,
  label varchar(255) not null default ''
);

create index if not exists idx_chat_message_links_message
  on public.chat_message_links (message_id);

create table if not exists public.chat_message_attachments (
  id bigserial primary key,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  file_name varchar(255) not null,
  mime_type varchar(120) not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null default '',
  file_bytes bytea,
  uploaded_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_message_attachments_message
  on public.chat_message_attachments (message_id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('comms.chat', 'comms', 'chat', 'Team chat', 40),
  ('comms.chat_admin', 'comms', 'chat_admin', 'Team chat admin', 50)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

-- store_admin: full chat write + admin
insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('comms.chat', 'comms.chat_admin')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

-- member: use chat (write) but not chat_admin
insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', 'comms.chat', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
