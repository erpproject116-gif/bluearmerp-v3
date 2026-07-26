-- SOP module: documents + versioning + registry.
begin;

create table if not exists public.sop_documents (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  title varchar(500) not null,
  category varchar(120) not null default 'general',
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  owner_user_id bigint references public.users(id) on delete set null,
  body text not null default '',
  version int not null default 1,
  reviewed_at date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sop_documents_tenant
  on public.sop_documents (tenant_id, status, category);

create table if not exists public.sop_document_versions (
  id bigserial primary key,
  document_id bigint not null references public.sop_documents(id) on delete cascade,
  version int not null,
  body text not null,
  changed_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('sop', 'SOP Library', 'tenant', false, true, 55)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'sop', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('sop', 'sop', null, 'SOP (module)', 0),
  ('sop.documents', 'sop', 'documents', 'SOP Documents', 10),
  ('sop.documents_write', 'sop', 'documents_write', 'SOP Documents Write', 20)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'sop'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
