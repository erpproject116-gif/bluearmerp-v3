-- First-party product analytics: durable sessions + page visits for Command Center.
begin;

create table if not exists public.app_usage_sessions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  auth_user_id uuid,
  client_session_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_activity_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  active_seconds int not null default 0,
  idle_seconds int not null default 0,
  page_view_count int not null default 0,
  end_reason varchar(40), -- logout | idle_timeout | tab_closed | expired | unknown
  user_agent text,
  created_at timestamptz not null default now(),
  unique (client_session_id)
);

create index if not exists idx_app_usage_sessions_tenant_started
  on public.app_usage_sessions (tenant_id, started_at desc);
create index if not exists idx_app_usage_sessions_user_started
  on public.app_usage_sessions (user_id, started_at desc);
create index if not exists idx_app_usage_sessions_open
  on public.app_usage_sessions (tenant_id, last_heartbeat_at desc)
  where ended_at is null;

create table if not exists public.app_usage_page_visits (
  id bigserial primary key,
  session_id bigint not null references public.app_usage_sessions(id) on delete cascade,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  client_visit_id uuid not null,
  seq int not null default 1,
  route_path varchar(512) not null,
  route_pattern varchar(512) not null default '',
  page_label varchar(255) not null default '',
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  active_seconds int not null default 0,
  idle_seconds int not null default 0,
  created_at timestamptz not null default now(),
  unique (client_visit_id)
);

create index if not exists idx_app_usage_page_visits_session_seq
  on public.app_usage_page_visits (session_id, seq);
create index if not exists idx_app_usage_page_visits_tenant_entered
  on public.app_usage_page_visits (tenant_id, entered_at desc);
create index if not exists idx_app_usage_page_visits_pattern
  on public.app_usage_page_visits (tenant_id, route_pattern, entered_at desc);

-- Daily rollups for fast Command Center charts.
create table if not exists public.app_usage_daily (
  day date not null,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  sessions int not null default 0,
  page_views int not null default 0,
  active_seconds bigint not null default 0,
  idle_seconds bigint not null default 0,
  unique_users int not null default 0,
  primary key (day, tenant_id)
);

create index if not exists idx_app_usage_daily_day
  on public.app_usage_daily (day desc);

insert into public.platform_permissions (permission_code, description, sort_order) values
  ('platform.analytics.read', 'View usage analytics and engagement reports', 85)
on conflict (permission_code) do update
set description = excluded.description, sort_order = excluded.sort_order;

insert into public.platform_role_permissions (role, permission_code)
select 'superadmin', 'platform.analytics.read'
on conflict do nothing;

insert into public.platform_role_permissions (role, permission_code) values
  ('support_viewer', 'platform.analytics.read'),
  ('support_agent', 'platform.analytics.read'),
  ('onboarding_specialist', 'platform.analytics.read'),
  ('customer_success', 'platform.analytics.read')
on conflict do nothing;

commit;
