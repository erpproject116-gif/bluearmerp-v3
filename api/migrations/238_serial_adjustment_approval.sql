-- Optional serial qty-fix approval (policy default OFF).
-- When inventory_require_serial_adjustment_approval is on, Apply submits for
-- approval if line count >= 5 OR any positive qty delta; otherwise posts immediately.

alter table public.tenant_process_policies
  add column if not exists inventory_require_serial_adjustment_approval boolean not null default false;

comment on column public.tenant_process_policies.inventory_require_serial_adjustment_approval is
  'When true, serial qty-fix Apply routes to Approvals Queue if lines >= 5 or any positive qty delta. Default off.';

create table if not exists public.inv_serial_adjustment_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  reason text not null,
  status text not null default 'unconfirmed'
    check (status in ('unconfirmed', 'e_approval', 'completed', 'rejected')),
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inv_serial_adj_req_tenant_status
  on public.inv_serial_adjustment_requests (tenant_id, status);

create table if not exists public.inv_serial_adjustment_request_lines (
  id bigserial primary key,
  request_id bigint not null references public.inv_serial_adjustment_requests(id) on delete cascade,
  serial_unit_id bigint not null references public.inv_serial_units(id) on delete restrict,
  qty_delta numeric(18, 6) not null,
  unique (request_id, serial_unit_id)
);

create index if not exists idx_inv_serial_adj_req_lines_request
  on public.inv_serial_adjustment_request_lines (request_id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.serial_adjustment_approve', 'inventory', 'serial_adjustment_approve', 'Approve serial qty fix', 102)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'inventory.serial_adjustment_approve'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;
