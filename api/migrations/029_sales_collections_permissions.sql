-- Sales collections report permissions + rename finance SI receipt status label.
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('sales.official_receipt_status', 'sales', 'official_receipt_status', 'Official Receipt Status', 360),
  ('sales.si_receipt_status', 'sales', 'si_receipt_status', 'SI Receipt Status', 365),
  ('sales.ar_by_customer', 'sales', 'ar_by_customer', 'A/R by Customer', 370),
  ('sales.sales_discount_status', 'sales', 'sales_discount_status', 'Sales Discount Status', 380),
  ('sales.print_sales_slips', 'sales', 'print_sales_slips', 'Print Sales Slips', 390)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

update public.permission_registry
set label = 'SI Receipt Status'
where permission_code = 'finance.reports_receipt_status';

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'sales.official_receipt_status',
  'sales.si_receipt_status',
  'sales.ar_by_customer',
  'sales.sales_discount_status',
  'sales.print_sales_slips'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'sales.official_receipt_status',
  'sales.si_receipt_status',
  'sales.ar_by_customer',
  'sales.sales_discount_status',
  'sales.print_sales_slips'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
