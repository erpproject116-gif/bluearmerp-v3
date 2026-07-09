-- Phase 1 Communications core: sent message log, email templates, thread links, module + permissions.
begin;

create table if not exists public.com_sent_messages (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  channel varchar(20) not null default 'email'
    check (channel in ('email')),
  doc_type varchar(80) not null,
  doc_id bigint not null,
  to_addrs jsonb not null default '[]'::jsonb,
  cc_addrs jsonb not null default '[]'::jsonb,
  subject varchar(500) not null default '',
  body_text text not null default '',
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  sent_by_user_id bigint references public.users(id) on delete set null,
  gmail_message_id varchar(255),
  gmail_thread_id varchar(255),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_com_sent_messages_tenant_list
  on public.com_sent_messages (tenant_id, created_at desc);

create index if not exists idx_com_sent_messages_doc
  on public.com_sent_messages (tenant_id, doc_type, doc_id);

create table if not exists public.com_email_templates (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  doc_type varchar(80) not null,
  subject_tpl varchar(500) not null default '',
  body_tpl text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, doc_type)
);

create table if not exists public.com_thread_links (
  id bigserial primary key,
  sent_message_id bigint not null references public.com_sent_messages(id) on delete cascade,
  doc_type varchar(80) not null,
  doc_id bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_com_thread_links_doc
  on public.com_thread_links (doc_type, doc_id);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('comms', 'Communications', 'tenant', false, true, 37)
on conflict (module_code) do update
set module_name = excluded.module_name,
    sort_order = excluded.sort_order;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'comms', true
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('comms', 'comms', null, 'Communications (module)', 0),
  ('comms.send', 'comms', 'send', 'Send documents by email', 10),
  ('comms.read', 'comms', 'read', 'View sent documents', 20),
  ('comms.admin', 'comms', 'admin', 'Communications settings', 30)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'comms'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.com_email_templates (tenant_id, doc_type, subject_tpl, body_tpl)
select t.id,
  'quotation',
  'Quotation {{reference_no}} from {{company_name}}',
  E'Dear {{customer_name}},\n\nPlease find attached our quotation {{reference_no}}.\n\nThank you,\n{{company_name}}'
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, doc_type) do nothing;

commit;
