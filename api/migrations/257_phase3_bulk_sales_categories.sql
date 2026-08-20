-- Phase 3: bulk item edit permission + tenant sales category lookup.

begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.items_bulk_edit', 'inventory', 'items_bulk_edit', 'Bulk edit items', 51),
  ('sales.sales_categories', 'sales', 'sales_categories', 'Sales categories', 215)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('inventory.items_bulk_edit', 'sales.sales_categories')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code = 'sales.sales_categories'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

create table if not exists public.sa_sales_categories (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_sa_sales_categories_tenant
  on public.sa_sales_categories (tenant_id, active);

insert into public.sa_sales_categories (tenant_id, code, name, sort_order)
select t.id, v.code, v.name, v.ord
from public.tenants t
cross join (values
  ('general', 'General', 0),
  ('returns', 'Returns', 1)
) as v(code, name, ord)
on conflict (tenant_id, code) do nothing;

alter table public.sa_sales drop constraint if exists sa_sales_sales_category_check;

commit;
