-- Shipping orders
begin;

create table if not exists public.sh_shipping_orders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  shipping_date date not null default current_date,
  date_seq int not null default 1,
  shipping_no text not null,
  sales_order_id bigint references public.so_sales_orders(id),
  partner_id bigint not null references public.inv_partners(id),
  location_id bigint not null references public.inv_locations(id),
  status text not null default 'draft',
  notes text,
  created_by_user_id bigint references public.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, shipping_no)
);

create table if not exists public.sh_shipping_order_lines (
  id bigserial primary key,
  shipping_order_id bigint not null references public.sh_shipping_orders(id) on delete cascade,
  sales_order_line_id bigint not null references public.so_sales_order_lines(id),
  qty numeric(18,4) not null default 0,
  line_no int not null default 1
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('shipping_order.read', 'sales_order', 'shipping_read', 'Shipping orders (read)', 70),
  ('shipping_order.write', 'sales_order', 'shipping_write', 'Shipping orders (write)', 71)
on conflict (permission_code) do nothing;

commit;
