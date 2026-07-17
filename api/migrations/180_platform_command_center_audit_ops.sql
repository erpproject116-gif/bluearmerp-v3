-- Platform Command Center: audit/access logs and follow-up tasks.
begin;

create table if not exists public.platform_audit_logs (
  id bigserial primary key,
  platform_user_id bigint references public.platform_users (id) on delete set null,
  actor_email varchar(320) not null default '',
  actor_name varchar(255) not null default '',
  action_code varchar(80) not null,
  event_kind varchar(40) not null default 'access', -- access | change | auth | deny
  http_method varchar(10) not null default '',
  route_path varchar(500) not null default '',
  platform_customer_id bigint,
  tenant_id bigint,
  target_type varchar(80) not null default '',
  target_id bigint,
  summary text not null default '',
  reason text not null default '',
  result_status int not null default 200,
  request_id varchar(80) not null default '',
  ip_address varchar(80) not null default '',
  metadata jsonb not null default '{}'::jsonb,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_audit_logs_created
  on public.platform_audit_logs (created_at desc);
create index if not exists idx_platform_audit_logs_actor
  on public.platform_audit_logs (platform_user_id, created_at desc);
create index if not exists idx_platform_audit_logs_customer
  on public.platform_audit_logs (platform_customer_id, created_at desc)
  where platform_customer_id is not null;
create index if not exists idx_platform_audit_logs_tenant
  on public.platform_audit_logs (tenant_id, created_at desc)
  where tenant_id is not null;

create table if not exists public.platform_follow_up_tasks (
  id bigserial primary key,
  platform_customer_id bigint not null references public.platform_customers (id) on delete cascade,
  tenant_id bigint,
  support_ticket_id bigint,
  title varchar(255) not null,
  task_type varchar(40) not null default 'call', -- call | demo | training | check_in | other
  stage varchar(40) not null default 'open', -- open | in_progress | done | cancelled
  due_at timestamptz,
  assigned_platform_user_id bigint references public.platform_users (id) on delete set null,
  created_by_platform_user_id bigint references public.platform_users (id) on delete set null,
  outcome text not null default '',
  next_action text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_follow_up_tasks_type_check check (task_type in ('call', 'demo', 'training', 'check_in', 'other')),
  constraint platform_follow_up_tasks_stage_check check (stage in ('open', 'in_progress', 'done', 'cancelled'))
);

create index if not exists idx_platform_follow_ups_customer
  on public.platform_follow_up_tasks (platform_customer_id, stage, due_at);
create index if not exists idx_platform_follow_ups_assignee
  on public.platform_follow_up_tasks (assigned_platform_user_id, stage, due_at)
  where assigned_platform_user_id is not null;
create index if not exists idx_platform_follow_ups_due
  on public.platform_follow_up_tasks (due_at)
  where stage in ('open', 'in_progress');

create table if not exists public.platform_ticket_internal_notes (
  id bigserial primary key,
  tenant_id bigint not null,
  ticket_id bigint not null references public.sup_support_tickets (id) on delete cascade,
  platform_user_id bigint references public.platform_users (id) on delete set null,
  author_email varchar(320) not null default '',
  author_name varchar(255) not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_ticket_notes_ticket
  on public.platform_ticket_internal_notes (ticket_id, created_at desc);

commit;
