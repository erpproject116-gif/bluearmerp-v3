-- Purchases (supplier invoice) header parity with Sales (actual sale).

alter table public.fin_supplier_invoices
  add column if not exists tax_type_id bigint references public.quo_tax_types(id),
  add column if not exists location_id bigint references public.inv_locations(id),
  add column if not exists pic_user_id bigint references public.users(id),
  add column if not exists pic_name varchar(255) not null default '',
  add column if not exists due_date date,
  add column if not exists terms_of_payment text check (terms_of_payment in ('30_days_terms', 'cash')),
  add column if not exists payment_terms text,
  add column if not exists project_id bigint references public.inv_projects(id),
  add column if not exists project_name varchar(255);

alter table public.fin_supplier_invoice_lines
  add column if not exists description text,
  add column if not exists remark text;

-- Purchases module permissions (mirror Sales module; reuse finance API).
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order)
values
  ('purchases.purchases_new', 'purchases', 'purchases_new', 'New Purchase', 520),
  ('purchases.purchases', 'purchases', 'purchases', 'Purchase List', 525),
  ('purchases.purchases_status', 'purchases', 'purchases_status', 'Purchase Status', 530)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, tr.role_code, pr.permission_code, 'write'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'store_admin'
cross join public.permission_registry pr
where pr.permission_code in ('purchases.purchases_new', 'purchases.purchases', 'purchases.purchases_status')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, tr.role_code, pr.permission_code, 'read'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'member'
cross join public.permission_registry pr
where pr.permission_code in ('purchases.purchases_new', 'purchases.purchases', 'purchases.purchases_status')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('purchases', 'Purchases', 'module', false, true, 136)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('purchases', 'purchase_order')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'purchases', true
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;
