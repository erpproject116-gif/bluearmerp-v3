-- Shipping rules
begin;

create table if not exists public.sh_shipping_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name text not null,
  zone text,
  carrier text,
  min_weight numeric(18,4),
  max_weight numeric(18,4),
  freight_item_id bigint references public.inv_items(id),
  flat_amount numeric(18,4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

commit;
