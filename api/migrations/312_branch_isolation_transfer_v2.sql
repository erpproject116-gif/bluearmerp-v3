-- Multi-branch commercial isolation + Transfer v2 foundation.
-- Flags default OFF (no behavior change until pilot enable).
begin;

-- Per-user home / operating branch.
alter table public.users
  add column if not exists home_location_id bigint references public.inv_locations(id) on delete set null;

create index if not exists idx_users_home_location
  on public.users (tenant_id, home_location_id)
  where home_location_id is not null;

-- Tenant feature flags (process policies).
alter table public.tenant_process_policies
  add column if not exists strict_branch_isolation boolean not null default false;

alter table public.tenant_process_policies
  add column if not exists transfer_handoff_v2 boolean not null default false;

comment on column public.tenant_process_policies.strict_branch_isolation is
  'When true, non-owners may only access commercial docs on home/assigned branches; inventory cross-branch read remains allowlisted.';

comment on column public.tenant_process_policies.transfer_handoff_v2 is
  'When true, location transfers use request/approve/ship/receive instead of draft→posted teleport.';

-- Expand stock entry statuses for Transfer v2 (keep legacy draft/posted/cancelled).
alter table public.inv_stock_entries
  drop constraint if exists inv_stock_entries_status_check;

alter table public.inv_stock_entries
  add constraint inv_stock_entries_status_check
  check (status in (
    'draft',
    'pending_approval',
    'approved',
    'in_transit',
    'received',
    'posted',
    'cancelled'
  ));

alter table public.inv_stock_entries
  add column if not exists shipped_at timestamptz,
  add column if not exists shipped_by_user_id bigint references public.users(id) on delete set null,
  add column if not exists received_at timestamptz,
  add column if not exists received_by_user_id bigint references public.users(id) on delete set null,
  add column if not exists in_transit_location_id bigint references public.inv_locations(id) on delete set null,
  add column if not exists variance_notes text,
  add column if not exists cross_branch_reason text;

-- Receive permission (team members at destination).
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.stock_transfer_receive', 'inventory', 'stock_transfer_receive', 'Receive Location Transfer', 57)
on conflict (permission_code) do update
  set label = excluded.label, module_code = excluded.module_code, feature_key = excluded.feature_key;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'inventory.stock_transfer_receive', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', 'inventory.stock_transfer_receive', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

-- Web Push subscriptions (Epic F2).
create table if not exists public.user_push_subscriptions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null default '',
  auth text not null default '',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_user_push_subscriptions_tenant_user
  on public.user_push_subscriptions (tenant_id, user_id);

-- Backfill home_location_id: single assigned location scope, else first active non-RMA location.
update public.users u
set home_location_id = s.record_id
from (
  select user_id, tenant_id, min(record_id) as record_id
  from public.user_data_scopes
  where scope_type in ('location', 'warehouse')
  group by user_id, tenant_id
  having count(*) = 1
) s
where u.id = s.user_id
  and u.tenant_id = s.tenant_id
  and u.home_location_id is null;

update public.users u
set home_location_id = loc.id
from (
  select distinct on (l.tenant_id) l.tenant_id, l.id
  from public.inv_locations l
  where l.status = 'active'
    and l.deleted_at is null
    and coalesce(l.is_rma, false) = false
    and coalesce(l.location_type, 'location') <> 'in_transit'
  order by l.tenant_id, l.id
) loc
where u.tenant_id = loc.tenant_id
  and u.home_location_id is null
  and u.status = 'active';

-- Allow system in-transit location type.
alter table public.inv_locations
  drop constraint if exists inv_locations_location_type_check;

alter table public.inv_locations
  add constraint inv_locations_location_type_check
  check (location_type = any (array['location', 'factory', 'factory_oe_manage', 'in_transit']));

-- Ensure an in-transit location exists per active tenant (system-managed).
insert into public.inv_locations (
  tenant_id, location_code, location_name, location_type, production_process, status, is_rma
)
select t.id, 'INTRN', 'In Transit', 'in_transit', 'bundle', 'active', false
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.inv_locations l
    where l.tenant_id = t.id
      and l.location_type = 'in_transit'
      and l.deleted_at is null
  );

commit;
