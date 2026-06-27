-- Serial & lot tracking: item flags, serial units, events, lot batches
begin;

alter table public.inv_items
  add column if not exists track_serial boolean not null default false,
  add column if not exists track_lot boolean not null default false;

alter table public.inv_items
  drop constraint if exists inv_items_track_serial_lot_exclusive;

alter table public.inv_items
  add constraint inv_items_track_serial_lot_exclusive
  check (not (track_serial and track_lot));

create table if not exists public.inv_serial_units (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  item_id bigint not null references public.inv_items(id),
  serial_no varchar(255) not null,
  status text not null default 'in_stock' check (status in (
    'in_stock', 'reserved', 'sold', 'in_transit', 'void', 'scrapped'
  )),
  location_id bigint references public.inv_locations(id),
  partner_id bigint references public.inv_partners(id),
  warranty_start date,
  warranty_end date,
  purchase_order_line_id bigint,
  goods_receipt_line_id bigint,
  sales_line_id bigint references public.sa_sales_lines(id) on delete set null,
  sales_order_release_line_id bigint references public.so_sales_order_release_lines(id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_inv_serial_units_tenant_serial
  on public.inv_serial_units (tenant_id, serial_no)
  where status <> 'void';

create index if not exists idx_inv_serial_units_list
  on public.inv_serial_units (tenant_id, status, item_id);

create index if not exists idx_inv_serial_units_location
  on public.inv_serial_units (tenant_id, location_id)
  where location_id is not null;

create index if not exists idx_inv_serial_units_warranty_end
  on public.inv_serial_units (tenant_id, warranty_end)
  where warranty_end is not null;

create table if not exists public.inv_serial_events (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  serial_unit_id bigint not null references public.inv_serial_units(id) on delete cascade,
  event_type text not null check (event_type in (
    'received', 'transferred', 'reserved', 'released', 'sold', 'returned', 'adjusted', 'voided'
  )),
  from_location_id bigint references public.inv_locations(id),
  to_location_id bigint references public.inv_locations(id),
  qty numeric(18,4) not null default 1 check (qty > 0),
  ref_type varchar(80),
  ref_id bigint,
  notes text,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_serial_events_unit
  on public.inv_serial_events (serial_unit_id, created_at desc);

create index if not exists idx_inv_serial_events_tenant
  on public.inv_serial_events (tenant_id, created_at desc);

create table if not exists public.inv_lot_batches (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  item_id bigint not null references public.inv_items(id),
  lot_no varchar(255) not null,
  location_id bigint not null references public.inv_locations(id),
  qty_on_hand numeric(18,4) not null default 0 check (qty_on_hand >= 0),
  expiry_date date,
  purchase_order_line_id bigint,
  goods_receipt_line_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_id, lot_no, location_id)
);

create index if not exists idx_inv_lot_batches_list
  on public.inv_lot_batches (tenant_id, item_id, location_id);

create table if not exists public.inv_serial_unit_sales_lines (
  sales_line_id bigint not null references public.sa_sales_lines(id) on delete cascade,
  serial_unit_id bigint not null references public.inv_serial_units(id) on delete cascade,
  primary key (sales_line_id, serial_unit_id)
);

commit;
