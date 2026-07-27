-- Serial number generator sequence + RMA warehouse / repair order SI link
begin;

-- Tenant-scoped counter for auto-generated serial numbers (unique via inv_serial_units index).
create table if not exists public.inv_serial_number_sequences (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  prefix text not null default 'SN',
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, prefix)
);

-- RMA / quarantine warehouses: qty may sit here but must not be sellable.
alter table public.inv_locations
  add column if not exists is_rma boolean not null default false;

comment on column public.inv_locations.is_rma is
  'When true, stock at this location is under RMA/repair and excluded from sellable available qty.';

-- Serial status: under RMA (not sellable).
alter table public.inv_serial_units
  drop constraint if exists inv_serial_units_status_check;

alter table public.inv_serial_units
  add constraint inv_serial_units_status_check
  check (status in (
    'in_stock', 'reserved', 'sold', 'in_transit', 'void', 'scrapped', 'rma'
  ));

alter table public.inv_serial_events
  drop constraint if exists inv_serial_events_event_type_check;

alter table public.inv_serial_events
  add constraint inv_serial_events_event_type_check
  check (event_type in (
    'received', 'transferred', 'reserved', 'released', 'sold', 'returned', 'adjusted', 'voided',
    'generated', 'rma_receive', 'rma_release'
  ));

-- Repair Order = service job that can act as RMA when linked to SI + RMA location.
alter table public.inv_repair_orders
  add column if not exists sales_id bigint references public.sa_sales(id) on delete set null,
  add column if not exists sales_line_id bigint references public.sa_sales_lines(id) on delete set null,
  add column if not exists serial_unit_id bigint references public.inv_serial_units(id) on delete set null,
  add column if not exists release_location_id bigint references public.inv_locations(id) on delete set null,
  add column if not exists rma_received_at timestamptz,
  add column if not exists released_to_stock_at timestamptz;

alter table public.inv_repair_orders
  drop constraint if exists inv_repair_orders_progress_status_check;

alter table public.inv_repair_orders
  add constraint inv_repair_orders_progress_status_check
  check (progress_status in (
    'received', 'diagnosing', 'repairing', 'awaiting_parts', 'finished', 'released'
  ));

create index if not exists idx_inv_repair_orders_sales
  on public.inv_repair_orders (tenant_id, sales_id)
  where sales_id is not null;

create index if not exists idx_inv_locations_is_rma
  on public.inv_locations (tenant_id)
  where is_rma = true;

commit;
