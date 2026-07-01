-- Minimal price list engine.
begin;

create table if not exists public.inv_price_lists (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name varchar(120) not null,
  currency_id bigint references public.quo_currencies(id),
  valid_from date,
  valid_to date,
  is_selling boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.inv_price_list_items (
  id bigserial primary key,
  price_list_id bigint not null references public.inv_price_lists(id) on delete cascade,
  item_id bigint not null references public.inv_items(id) on delete cascade,
  rate numeric(18,4) not null check (rate >= 0),
  unique (price_list_id, item_id)
);

alter table public.inv_partners
  add column if not exists default_price_list_id bigint references public.inv_price_lists(id);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('inventory.price_lists', 'Price List', 'feature', false, true, 12)
on conflict (module_code) do update set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('inventory.price_lists', 'inventory')
on conflict do nothing;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.price_lists', 'inventory', 'price_lists', 'Price Lists', 65),
  ('inventory.price_list_items', 'inventory', 'price_list_items', 'Price List Items', 66)
on conflict (permission_code) do nothing;

commit;
