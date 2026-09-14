-- Support remote workspace access: sessions, ghost membership marker, permission.
begin;

create table if not exists public.platform_support_sessions (
  id bigserial primary key,
  platform_user_id bigint references public.platform_users (id) on delete set null,
  auth_user_id uuid not null,
  customer_id bigint not null references public.platform_customers (id) on delete cascade,
  tenant_id bigint not null references public.tenants (id) on delete cascade,
  ghost_user_id bigint references public.users (id) on delete set null,
  created_ghost boolean not null default false,
  access_mode varchar(20) not null default 'read_only'
    check (access_mode in ('read_only', 'read_write')),
  reason text not null,
  extends_used smallint not null default 0 check (extends_used >= 0 and extends_used <= 1),
  previous_active_tenant_id bigint references public.tenants (id) on delete set null,
  previous_full_name varchar(255),
  previous_user_status varchar(30),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  ended_by varchar(40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_support_sessions_customer
  on public.platform_support_sessions (customer_id, started_at desc);

create index if not exists idx_platform_support_sessions_auth_open
  on public.platform_support_sessions (auth_user_id)
  where ended_at is null;

create index if not exists idx_platform_support_sessions_tenant_open
  on public.platform_support_sessions (tenant_id)
  where ended_at is null;

alter table public.users
  add column if not exists support_session_id bigint references public.platform_support_sessions (id) on delete set null;

create unique index if not exists uq_users_active_support_ghost
  on public.users (auth_user_id, tenant_id)
  where support_session_id is not null and status = 'active' and auth_user_id is not null;

insert into public.platform_permissions (permission_code, description, sort_order) values
  ('platform.support.access', 'Open customer workspaces as Bluearm support', 86)
on conflict (permission_code) do update
set description = excluded.description, sort_order = excluded.sort_order;

insert into public.platform_role_permissions (role, permission_code)
values
  ('superadmin', 'platform.support.access'),
  ('support_agent', 'platform.support.access')
on conflict do nothing;

commit;
