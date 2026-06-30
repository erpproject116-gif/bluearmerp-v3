-- Tenant process policies: configurable require/skip gates for commercial flows
begin;

create table if not exists public.tenant_process_policies (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  sales_require_quotation boolean not null default false,
  sales_require_so boolean not null default false,
  sales_require_reservation boolean not null default false,
  sales_require_delivery_receipt boolean not null default false,
  purchase_require_pr boolean not null default false,
  purchase_require_pr_approval boolean not null default false,
  purchase_require_gr_before_supplier_invoice boolean not null default false,
  legacy_combined_so_release boolean not null default true,
  updated_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenant_process_policies (tenant_id)
select t.id from public.tenants t
on conflict (tenant_id) do nothing;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('settings.process_policies', 'core', 'process_policies', 'Process flow policies', 15)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'settings.process_policies', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
