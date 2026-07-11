-- POS cart: lot batch pick for lot-tracked items at checkout
begin;

alter table public.pos_cart_lines
  add column if not exists lot_batch_id bigint references public.inv_lot_batches(id) on delete set null;

comment on column public.pos_cart_lines.lot_batch_id is 'Selected lot batch for lot-tracked items; applied to sa_sales_lines at checkout.';

commit;
