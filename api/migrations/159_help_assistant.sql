-- Help Assistant feedback + future analytics.
create table if not exists public.help_feedback_events (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint references public.users(id) on delete set null,
  query text not null,
  pathname text not null default '',
  article_id varchar(120) not null,
  vote varchar(10) not null check (vote in ('up', 'down')),
  created_at timestamptz not null default now()
);

create index if not exists idx_help_feedback_tenant_created
  on public.help_feedback_events (tenant_id, created_at desc);

create index if not exists idx_help_feedback_article
  on public.help_feedback_events (tenant_id, article_id, vote);
