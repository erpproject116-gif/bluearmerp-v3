-- Location-level inventory balances (read model for item picker + quotation outstanding)
begin;

alter table public.inv_items
  add column if not exists default_location_id bigint references public.inv_locations(id);

create table if not exists public.inv_item_location_balances (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  item_id bigint not null references public.inv_items(id) on delete cascade,
  location_id bigint not null references public.inv_locations(id) on delete cascade,
  qty_on_hand numeric(18,4) not null default 0 check (qty_on_hand >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, item_id, location_id)
);

create index if not exists idx_inv_item_loc_bal_item
  on public.inv_item_location_balances (tenant_id, item_id);

create index if not exists idx_inv_item_loc_bal_location
  on public.inv_item_location_balances (tenant_id, location_id);

commit;
