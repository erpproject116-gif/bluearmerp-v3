-- Phase 2: inventory containers (boxes / weighed packs)
begin;

create table if not exists public.inv_containers (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  container_no varchar(64) not null,
  container_type text not null default 'box',
  item_id bigint not null references public.inv_items(id),
  lot_batch_id bigint references public.inv_lot_batches(id) on delete set null,
  location_id bigint not null references public.inv_locations(id),
  status text not null default 'in_stock'
    check (status in ('in_stock', 'opened', 'depleted', 'shipped', 'void')),
  gross_weight_kg numeric(18,4),
  tare_weight_kg numeric(18,4),
  net_weight_kg numeric(18,4) not null check (net_weight_kg > 0),
  goods_receipt_line_id bigint references public.gr_goods_receipt_lines(id) on delete set null,
  received_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_inv_containers_tenant_no
  on public.inv_containers (tenant_id, container_no)
  where status <> 'void';

create index if not exists idx_inv_containers_list
  on public.inv_containers (tenant_id, item_id, location_id, status);

create table if not exists public.inv_container_lines (
  id bigserial primary key,
  container_id bigint not null references public.inv_containers(id) on delete cascade,
  item_id bigint not null references public.inv_items(id),
  weight_kg numeric(18,4) not null check (weight_kg > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_container_lines_container
  on public.inv_container_lines (container_id);

alter table public.gr_goods_receipt_line_lots
  add column if not exists container_id bigint references public.inv_containers(id) on delete set null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.containers', 'inventory', 'containers', 'Inventory containers', 47),
  ('inventory.pack_station', 'inventory', 'containers', 'Pack station', 48)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('inventory.containers', 'inventory.pack_station')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
