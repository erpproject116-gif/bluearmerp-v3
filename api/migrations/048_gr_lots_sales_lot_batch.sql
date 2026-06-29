-- Goods receipt line lots + sales lot batch reference
begin;

create table if not exists public.gr_goods_receipt_line_lots (
  id bigserial primary key,
  goods_receipt_line_id bigint not null references public.gr_goods_receipt_lines(id) on delete cascade,
  lot_no varchar(255) not null,
  qty numeric(18,4) not null check (qty > 0),
  expiry_date date,
  created_at timestamptz not null default now(),
  unique (goods_receipt_line_id, lot_no)
);

create index if not exists idx_gr_goods_receipt_line_lots_line
  on public.gr_goods_receipt_line_lots (goods_receipt_line_id);

alter table public.sa_sales_lines
  add column if not exists lot_batch_id bigint references public.inv_lot_batches(id) on delete set null;

commit;
