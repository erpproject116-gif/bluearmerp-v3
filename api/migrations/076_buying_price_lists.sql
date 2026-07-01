-- Buying price lists: distinguish selling vs buying lists on inv_price_lists.
begin;

alter table public.inv_price_lists
  add column if not exists is_buying boolean not null default false;

update public.inv_price_lists
set is_selling = true
where is_buying = false and is_selling = false;

commit;
