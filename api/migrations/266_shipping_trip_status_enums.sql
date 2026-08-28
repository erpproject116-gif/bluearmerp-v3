-- Lock shipping order and delivery trip status vocabularies (G-12).
begin;

-- Normalize free-form shipping statuses before adding the check.
update public.sh_shipping_orders
set status = lower(trim(status))
where status is not null;

update public.sh_shipping_orders
set status = 'cancelled'
where status in ('cancel', 'canceled');

update public.sh_shipping_orders
set status = 'shipped'
where status in ('ship', 'complete', 'completed', 'done');

update public.sh_shipping_orders
set status = 'confirmed'
where status in ('confirm', 'open', 'active');

update public.sh_shipping_orders
set status = 'draft'
where status is null
   or trim(status) = ''
   or status not in ('draft', 'confirmed', 'shipped', 'cancelled');

alter table public.sh_shipping_orders
  drop constraint if exists sh_shipping_orders_status_check;

alter table public.sh_shipping_orders
  add constraint sh_shipping_orders_status_check
  check (status in ('draft', 'confirmed', 'shipped', 'cancelled'));

-- Delivery trips
update public.dl_delivery_trips
set status = lower(trim(status))
where status is not null;

update public.dl_delivery_trips
set status = 'cancelled'
where status in ('cancel', 'canceled');

update public.dl_delivery_trips
set status = 'completed'
where status in ('complete', 'done', 'shipped');

update public.dl_delivery_trips
set status = 'in_progress'
where status in ('progress', 'active', 'started');

update public.dl_delivery_trips
set status = 'planned'
where status is null
   or trim(status) = ''
   or status not in ('planned', 'in_progress', 'completed', 'cancelled');

alter table public.dl_delivery_trips
  drop constraint if exists dl_delivery_trips_status_check;

alter table public.dl_delivery_trips
  add constraint dl_delivery_trips_status_check
  check (status in ('planned', 'in_progress', 'completed', 'cancelled'));

commit;
