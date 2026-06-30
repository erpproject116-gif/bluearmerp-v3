-- Purchase request lightweight approval audit trail
begin;

alter table public.pr_purchase_requests
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_user_id bigint references public.users(id);

create index if not exists idx_pr_purchase_requests_approved
  on public.pr_purchase_requests (tenant_id, approved_at)
  where deleted_at is null and approved_at is not null;

create table if not exists public.pr_approvals (
  id bigserial primary key,
  purchase_request_id bigint not null references public.pr_purchase_requests(id) on delete cascade,
  action text not null check (action in ('submit', 'approve', 'reject')),
  actor_user_id bigint references public.users(id),
  actor_name varchar(255),
  remarks text,
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pr_approvals_pr
  on public.pr_approvals (purchase_request_id, created_at desc);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_request.approve', 'purchase_request', 'approve', 'Approve Purchase Requests', 295)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'purchase_request.approve'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'purchase_request.approve'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
