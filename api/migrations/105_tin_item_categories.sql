-- TIN fields, item category master (fixes migration 101 FK), item category link on items
begin;

alter table public.tenants
  add column if not exists tin varchar(32);

alter table public.inv_partners
  add column if not exists tin varchar(32);

create table if not exists public.inv_item_categories (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(50) not null,
  name varchar(255) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_inv_item_categories_tenant
  on public.inv_item_categories (tenant_id, active);

alter table public.inv_items
  add column if not exists item_category_id bigint references public.inv_item_categories(id) on delete set null;

insert into public.inv_item_categories (tenant_id, code, name)
select t.id, v.code, v.name
from public.tenants t
cross join (
  values
    ('raw_material', 'Raw Material'),
    ('sub_material', 'Sub Material'),
    ('finished_goods', 'Finished Goods'),
    ('semi_finished_goods', 'Semi-Finished Goods'),
    ('merchandise', 'Merchandise'),
    ('intangible_merchandise', 'Intangible Merchandise')
) as v(code, name)
on conflict (tenant_id, code) do update set name = excluded.name;

update public.inv_items i
set item_category_id = c.id
from public.inv_item_categories c
where c.tenant_id = i.tenant_id
  and c.code = i.item_category
  and i.deleted_at is null
  and i.item_category_id is null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.item_categories', 'inventory', 'item_categories', 'Item categories', 95)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'inventory.item_categories', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', 'inventory.item_categories', 'read'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
