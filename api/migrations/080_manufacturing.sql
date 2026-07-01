-- Manufacturing: single-level BOMs and work orders.
begin;

create table if not exists public.mfg_boms (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  bom_code varchar(50) not null,
  bom_name varchar(255) not null,
  finished_item_id bigint not null references public.inv_items(id),
  default_location_id bigint references public.inv_locations(id),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bom_code)
);

create index if not exists idx_mfg_boms_tenant
  on public.mfg_boms (tenant_id, is_active);

create table if not exists public.mfg_bom_lines (
  id bigserial primary key,
  bom_id bigint not null references public.mfg_boms(id) on delete cascade,
  line_no int not null,
  component_item_id bigint not null references public.inv_items(id),
  qty numeric(18,4) not null check (qty > 0),
  unique (bom_id, line_no)
);

create table if not exists public.mfg_work_orders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_no varchar(30) not null,
  bom_id bigint not null references public.mfg_boms(id),
  finished_item_id bigint not null references public.inv_items(id),
  location_id bigint not null references public.inv_locations(id),
  qty_to_produce numeric(18,4) not null check (qty_to_produce > 0),
  qty_produced numeric(18,4) not null default 0 check (qty_produced >= 0),
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'released', 'completed', 'cancelled')),
  order_date date not null default current_date,
  notes text,
  released_at timestamptz,
  completed_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, work_order_no)
);

create index if not exists idx_mfg_work_orders_list
  on public.mfg_work_orders (tenant_id, status, order_date desc);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('manufacturing', 'Manufacturing', 'tenant', false, true, 37)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('manufacturing', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'manufacturing', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('manufacturing', 'manufacturing', null, 'Manufacturing (module)', 0),
  ('manufacturing.boms', 'manufacturing', 'boms', 'Bills of Material', 10),
  ('manufacturing.work_orders', 'manufacturing', 'work_orders', 'Work Orders', 20),
  ('manufacturing.work_orders_release', 'manufacturing', 'work_orders_release', 'Release Work Order', 30),
  ('manufacturing.work_orders_complete', 'manufacturing', 'work_orders_complete', 'Complete Work Order', 40)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'manufacturing'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

update public.tenant_role_permissions
set can_submit = true
where role_code = 'store_admin'
  and permission_code in (
    'manufacturing.work_orders_release',
    'manufacturing.work_orders_complete'
  );

commit;
