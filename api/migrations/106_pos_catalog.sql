-- POS catalog: category styling, item images, per-tenant POS settings, pos.manage permission.
begin;

alter table public.inv_item_categories
  add column if not exists icon varchar(50),
  add column if not exists color varchar(20),
  add column if not exists sort_order int not null default 0;

alter table public.inv_items
  add column if not exists image_path varchar(500);

create table if not exists public.pos_settings (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  default_location_id bigint references public.inv_locations(id) on delete set null,
  default_tax_type_id bigint references public.quo_tax_types(id) on delete set null,
  tax_inclusive boolean not null default true,
  order_types jsonb not null default '["dine_in","take_away"]'::jsonb,
  allowed_tenders jsonb not null default '["cash","card"]'::jsonb,
  require_customer boolean not null default false,
  enable_barcode boolean not null default false,
  receipt_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed one settings row per tenant, defaulting to the tenant's default currency's tax type when available.
insert into public.pos_settings (tenant_id, default_tax_type_id)
select t.id,
  (select tt.id from public.quo_tax_types tt
   where tt.tenant_id = t.id and tt.status = 'active' and tt.deleted_at is null
   order by tt.sort_order, tt.id limit 1)
from public.tenants t
on conflict (tenant_id) do nothing;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('pos.manage', 'pos', 'manage', 'POS Management', 40)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'pos.manage', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
