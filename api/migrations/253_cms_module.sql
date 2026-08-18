-- In-app CMS: pages, media library, slug redirects.
begin;

create table if not exists public.cms_media (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  file_name varchar(255) not null,
  mime_type varchar(120),
  size_bytes bigint not null default 0,
  storage_path text not null,
  file_bytes bytea,
  alt_text varchar(500) not null default '',
  uploaded_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_cms_media_tenant
  on public.cms_media (tenant_id, created_at desc)
  where deleted_at is null;

create table if not exists public.cms_pages (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  title varchar(500) not null,
  slug varchar(120) not null,
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  body text not null default '',
  seo_title varchar(200),
  seo_description varchar(320),
  featured_media_id bigint references public.cms_media(id) on delete set null,
  published_at timestamptz,
  created_by_user_id bigint references public.users(id) on delete set null,
  updated_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cms_pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 120)
);

create unique index if not exists cms_pages_tenant_slug_alive
  on public.cms_pages (tenant_id, slug)
  where deleted_at is null;

create index if not exists idx_cms_pages_tenant_status
  on public.cms_pages (tenant_id, status, updated_at desc)
  where deleted_at is null;

create table if not exists public.cms_redirects (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  from_slug varchar(120) not null,
  to_slug varchar(120) not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cms_redirects_slug_format check (
    from_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and to_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and from_slug <> to_slug
  )
);

create unique index if not exists cms_redirects_tenant_from_alive
  on public.cms_redirects (tenant_id, from_slug)
  where deleted_at is null;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('cms', 'Pages', 'tenant', false, true, 57)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'cms', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('cms', 'cms', null, 'Pages (module)', 0),
  ('cms.pages', 'cms', 'pages', 'Pages', 10),
  ('cms.pages_write', 'cms', 'pages_write', 'Pages Write', 20),
  ('cms.media', 'cms', 'media', 'Media', 30),
  ('cms.media_write', 'cms', 'media_write', 'Media Write', 40)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'cms'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
