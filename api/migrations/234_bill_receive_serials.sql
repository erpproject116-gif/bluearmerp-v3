-- Unified New Bill receive: allow GR without PO (blank bill lines); persist serials on bill lines.
begin;

alter table public.gr_goods_receipts
  alter column purchase_order_id drop not null;

alter table public.gr_goods_receipt_lines
  alter column purchase_order_line_id drop not null;

alter table public.fin_supplier_invoice_lines
  add column if not exists serial_nos jsonb not null default '[]'::jsonb,
  add column if not exists lot_lines jsonb not null default '[]'::jsonb;

comment on column public.fin_supplier_invoice_lines.serial_nos is
  'Serial numbers captured on the Bill line (ECOUNT-style). Applied to stock on receive.';
comment on column public.fin_supplier_invoice_lines.lot_lines is
  'Lot/batch lines [{lot_no, qty}] for lot-tracked items.';

commit;
