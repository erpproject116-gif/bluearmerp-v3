-- Selling depth: product bundles, sales person on SO, customer credit balance report.
begin;

create table if not exists public.inv_product_bundles (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  bundle_code varchar(50) not null,
  bundle_name varchar(255) not null,
  parent_item_id bigint references public.inv_items(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bundle_code)
);

create table if not exists public.inv_product_bundle_lines (
  id bigserial primary key,
  bundle_id bigint not null references public.inv_product_bundles(id) on delete cascade,
  line_no int not null,
  component_item_id bigint not null references public.inv_items(id),
  qty numeric(18,4) not null default 1 check (qty > 0),
  unique (bundle_id, line_no)
);

alter table public.so_sales_orders
  add column if not exists sales_person_id bigint references public.users(id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('sales.customer_credit_balance', 'sales', 'customer_credit_balance', 'Customer Credit Balance', 375)
on conflict (permission_code) do nothing;

commit;
