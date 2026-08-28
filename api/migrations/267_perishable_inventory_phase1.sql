-- Phase 1: perishable / catch-weight item flags, lot batch idempotency, process policies, label sequences
begin;

alter table public.inv_items
  add column if not exists catch_weight boolean not null default false,
  add column if not exists default_shelf_life_days int,
  add column if not exists lot_allocation_method text not null default 'manual',
  add column if not exists price_basis text not null default 'unit';

alter table public.inv_items
  drop constraint if exists inv_items_lot_allocation_method_check;

alter table public.inv_items
  add constraint inv_items_lot_allocation_method_check
  check (lot_allocation_method in ('manual', 'fefo', 'fifo'));

alter table public.inv_items
  drop constraint if exists inv_items_price_basis_check;

alter table public.inv_items
  add constraint inv_items_price_basis_check
  check (price_basis in ('unit', 'per_kg'));

alter table public.inv_items
  drop constraint if exists inv_items_catch_weight_requires_lot;

alter table public.inv_items
  add constraint inv_items_catch_weight_requires_lot
  check (not catch_weight or (track_lot and not track_serial));

alter table public.gr_goods_receipt_line_lots
  add column if not exists client_scan_id uuid;

create unique index if not exists uq_gr_line_lots_client_scan
  on public.gr_goods_receipt_line_lots (goods_receipt_line_id, client_scan_id)
  where client_scan_id is not null;

alter table public.tenant_process_policies
  add column if not exists inventory_block_expired_lot_sales boolean not null default false,
  add column if not exists inventory_default_lot_allocation text not null default 'manual';

alter table public.tenant_process_policies
  drop constraint if exists tenant_process_policies_inv_lot_alloc_check;

alter table public.tenant_process_policies
  add constraint tenant_process_policies_inv_lot_alloc_check
  check (inventory_default_lot_allocation in ('manual', 'fefo', 'fifo'));

create table if not exists public.inv_label_sequences (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  sequence_key text not null,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, sequence_key)
);

create table if not exists public.sa_sales_line_lot_allocations (
  sales_line_id bigint not null references public.sa_sales_lines(id) on delete cascade,
  lot_batch_id bigint not null references public.inv_lot_batches(id) on delete restrict,
  qty numeric(18,4) not null check (qty > 0),
  primary key (sales_line_id, lot_batch_id)
);

create index if not exists idx_sa_sales_line_lot_alloc_lot
  on public.sa_sales_line_lot_allocations (lot_batch_id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.receive_station', 'inventory', 'serial_lot', 'Receive station', 45),
  ('inventory.labels_print', 'inventory', 'serial_lot', 'Print inventory labels', 46)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('inventory.receive_station', 'inventory.labels_print')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
