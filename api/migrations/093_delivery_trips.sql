-- Delivery trips
begin;

create table if not exists public.dl_delivery_trips (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  trip_date date not null default current_date,
  trip_no text not null,
  driver_name text,
  vehicle_no text,
  status text not null default 'planned',
  notes text,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, trip_no)
);

create table if not exists public.dl_delivery_trip_receipts (
  id bigserial primary key,
  trip_id bigint not null references public.dl_delivery_trips(id) on delete cascade,
  delivery_receipt_id bigint not null references public.dr_delivery_receipts(id),
  sort_order int not null default 1,
  unique (trip_id, delivery_receipt_id)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('delivery_trip.read', 'sales_order', 'delivery_trip_read', 'Delivery trips (read)', 72),
  ('delivery_trip.write', 'sales_order', 'delivery_trip_write', 'Delivery trips (write)', 73)
on conflict (permission_code) do nothing;

commit;
