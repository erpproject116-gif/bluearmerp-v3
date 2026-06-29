-- Goods receipt serial batch scan: idempotency + pending duplicate lookup
begin;

alter table public.gr_goods_receipt_serials
  add column if not exists client_scan_id uuid;

create unique index if not exists uq_gr_goods_receipt_serials_line_client_scan
  on public.gr_goods_receipt_serials (goods_receipt_line_id, client_scan_id)
  where client_scan_id is not null;

create index if not exists idx_gr_serials_serial_no
  on public.gr_goods_receipt_serials (serial_no);

commit;
