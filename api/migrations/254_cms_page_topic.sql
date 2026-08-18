-- Topic cluster for published CMS articles: /articles/{topic}/{slug}
begin;

alter table public.cms_pages
  add column if not exists topic varchar(120) not null default 'blog';

alter table public.cms_pages
  drop constraint if exists cms_pages_topic_format;

alter table public.cms_pages
  add constraint cms_pages_topic_format
  check (topic ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(topic) between 1 and 120);

create index if not exists idx_cms_pages_tenant_topic
  on public.cms_pages (tenant_id, topic, published_at desc)
  where deleted_at is null;

commit;
