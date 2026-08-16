-- Stock quantity adjustment approval (policy default OFF).
-- When inventory_require_stock_adjustment_approval is on, POST /stock-adjustments
-- creates a request for Approvals Queue instead of posting immediately.

alter table public.tenant_process_policies
  add column if not exists inventory_require_stock_adjustment_approval boolean not null default false;

comment on column public.tenant_process_policies.inventory_require_stock_adjustment_approval is
  'When true, stock quantity adjustments require store admin approval before inventory updates. Default off.';

create table if not exists public.inv_stock_adjustment_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  item_id bigint not null references public.inv_items(id) on delete restrict,
  location_id bigint not null references public.inv_locations(id) on delete restrict,
  qty_delta numeric(18, 6) not null,
  reason text not null,
  status text not null default 'draft'
    check (status in ('draft', 'e_approval', 'completed', 'rejected')),
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_stock_adj_req_qty_nonzero check (qty_delta <> 0)
);

create index if not exists idx_inv_stock_adj_req_tenant_status
  on public.inv_stock_adjustment_requests (tenant_id, status);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.stock_adjustment_approve', 'inventory', 'stock_adjustment_approve', 'Approve stock adjustments', 103)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'inventory.stock_adjustment_approve'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;
