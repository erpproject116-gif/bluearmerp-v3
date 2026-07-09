-- Phase 2: ECount-style price levels (B–J) and per-document-type safety stock on item master.
begin;

alter table public.inv_items
  add column if not exists price_levels jsonb not null default '{}',
  add column if not exists safety_stock_by_doc jsonb not null default '{}';

comment on column public.inv_items.price_levels is 'Selling price levels B–J: {"B": 100, "C": 95, ...}';
comment on column public.inv_items.safety_stock_by_doc is 'Safety qty by doc type: quotation, sales_order, shipping_order, sales, goods_receipt, purchase_order, purchase';

commit;
