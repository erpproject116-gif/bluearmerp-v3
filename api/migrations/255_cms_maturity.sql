-- CMS maturity: visibility, lang, focus phrase, revisions, publisher permission.
begin;

alter table public.cms_pages
  add column if not exists lang varchar(8) not null default 'tl',
  add column if not exists focus_phrase varchar(120),
  add column if not exists visibility varchar(20) not null default 'internal';

alter table public.cms_pages drop constraint if exists cms_pages_visibility_check;
alter table public.cms_pages
  add constraint cms_pages_visibility_check check (visibility in ('internal', 'public'));

alter table public.cms_pages drop constraint if exists cms_pages_lang_check;
alter table public.cms_pages
  add constraint cms_pages_lang_check check (lang ~ '^[a-z]{2}(-[A-Za-z]{2})?$');

update public.cms_pages
set visibility = 'public'
where deleted_at is null and status = 'published' and visibility = 'internal';

create table if not exists public.cms_page_revisions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  page_id bigint not null references public.cms_pages(id) on delete cascade,
  title varchar(500) not null,
  topic varchar(80) not null,
  slug varchar(120) not null,
  body text not null default '',
  seo_title varchar(200),
  seo_description varchar(320),
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cms_page_revisions_page
  on public.cms_page_revisions (tenant_id, page_id, created_at desc);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('cms.pages_publish', 'cms', 'pages_publish', 'Pages Publish', 25)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select trp.tenant_id, trp.role_code, 'cms.pages_publish', trp.access_level
from public.tenant_role_permissions trp
where trp.permission_code = 'cms.pages_write'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
