-- Shipping freight + landed cost line header link
begin;

alter table public.sh_shipping_orders
  add column if not exists shipping_zone text,
  add column if not exists carrier text,
  add column if not exists freight_amount numeric(18,4);

commit;
