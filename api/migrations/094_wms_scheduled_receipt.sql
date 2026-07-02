-- WMS scheduled receipt
begin;

create table if not exists public.wms_scheduled_receipts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  purchase_order_line_id bigint not null references public.po_purchase_order_lines(id),
  expected_date date not null,
  qty numeric(18,4) not null default 0,
  status text not null default 'in_progress',
  goods_receipt_id bigint references public.gr_goods_receipts(id),
  created_by_user_id bigint references public.users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wms_scheduled_releases (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  sales_order_line_id bigint not null references public.so_sales_order_lines(id),
  expected_date date not null,
  qty numeric(18,4) not null default 0,
  status text not null default 'in_progress',
  release_line_id bigint references public.so_sales_order_release_lines(id),
  created_by_user_id bigint references public.users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('wms', 'WMS', 'tenant', false, true, 11)
on conflict (module_code) do update set module_name = excluded.module_name;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('wms.read', 'wms', 'read', 'WMS scheduled receipts', 0),
  ('wms.write', 'wms', 'write', 'Process WMS receipts', 10)
on conflict (permission_code) do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'wms', false from public.tenants t
on conflict (tenant_id, module_code) do nothing;

commit;
