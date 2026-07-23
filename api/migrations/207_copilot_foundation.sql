-- Copilot / Help AI: sessions, messages, daily usage, ranking overrides.

create table if not exists public.copilot_sessions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint references public.users(id) on delete set null,
  pathname text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_copilot_sessions_tenant_user
  on public.copilot_sessions (tenant_id, user_id, updated_at desc);

create table if not exists public.copilot_messages (
  id bigserial primary key,
  session_id bigint not null references public.copilot_sessions(id) on delete cascade,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  role varchar(20) not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null default '',
  article_ids jsonb not null default '[]'::jsonb,
  tool_name varchar(80),
  action_draft jsonb,
  model varchar(80),
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_copilot_messages_session
  on public.copilot_messages (session_id, id);

create table if not exists public.copilot_usage_daily (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  usage_date date not null,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  call_count int not null default 0,
  primary key (tenant_id, usage_date)
);

create table if not exists public.help_ranking_overrides (
  id bigserial primary key,
  tenant_id bigint references public.tenants(id) on delete cascade,
  article_id varchar(120) not null,
  query_token varchar(80) not null default '',
  boost numeric(8, 3) not null default 0,
  demote numeric(8, 3) not null default 0,
  vote_up int not null default 0,
  vote_down int not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, article_id, query_token)
);

create index if not exists idx_help_ranking_article
  on public.help_ranking_overrides (article_id);

-- Approve-to-act audit (Phase 3).
create table if not exists public.copilot_action_audits (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint references public.users(id) on delete set null,
  session_id bigint references public.copilot_sessions(id) on delete set null,
  action_type varchar(80) not null,
  draft jsonb not null default '{}'::jsonb,
  decision varchar(20) not null check (decision in ('approved', 'denied')),
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_copilot_action_audits_tenant
  on public.copilot_action_audits (tenant_id, created_at desc);
