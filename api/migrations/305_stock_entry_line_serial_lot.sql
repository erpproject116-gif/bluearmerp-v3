-- Location Transfer Wave 4: serial/lot attachments on stock entry lines.
begin;

create table if not exists public.inv_stock_entry_line_serials (
  stock_entry_line_id bigint not null references public.inv_stock_entry_lines(id) on delete cascade,
  serial_unit_id bigint not null references public.inv_serial_units(id) on delete restrict,
  primary key (stock_entry_line_id, serial_unit_id)
);

create unique index if not exists uq_inv_stock_entry_line_serials_unit
  on public.inv_stock_entry_line_serials (serial_unit_id);

create index if not exists idx_inv_stock_entry_line_serials_line
  on public.inv_stock_entry_line_serials (stock_entry_line_id);

create table if not exists public.inv_stock_entry_line_lots (
  stock_entry_line_id bigint not null references public.inv_stock_entry_lines(id) on delete cascade,
  lot_batch_id bigint not null references public.inv_lot_batches(id) on delete restrict,
  qty numeric(18,4) not null check (qty > 0),
  primary key (stock_entry_line_id, lot_batch_id)
);

create index if not exists idx_inv_stock_entry_line_lots_line
  on public.inv_stock_entry_line_lots (stock_entry_line_id);

create index if not exists idx_inv_stock_entry_line_lots_batch
  on public.inv_stock_entry_line_lots (lot_batch_id);

commit;
