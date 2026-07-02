-- Universal approval platform
begin;

create table if not exists public.approval_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  status text not null default 'e_approval',
  submitted_at timestamptz not null default now(),
  submitted_by_user_id bigint references public.users(id),
  decided_at timestamptz,
  decided_by_user_id bigint references public.users(id),
  unique (tenant_id, entity_type, entity_id)
);

create index if not exists idx_approval_requests_pending
  on public.approval_requests (tenant_id, status, submitted_at desc);

create table if not exists public.approval_actions (
  id bigserial primary key,
  request_id bigint not null references public.approval_requests(id) on delete cascade,
  action text not null,
  actor_user_id bigint references public.users(id),
  remarks text,
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('dashboard.approvals', 'dashboard', 'approvals', 'Approval queue', 15)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'dashboard.approvals', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
