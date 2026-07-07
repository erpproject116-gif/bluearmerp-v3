-- Allow e-Approval on sales invoices (ECount Sales List status pills).

alter table public.sa_sales drop constraint if exists sa_sales_progress_status_check;

alter table public.sa_sales
  add constraint sa_sales_progress_status_check
  check (progress_status in ('unconfirmed', 'e_approval', 'completed'));

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order)
values ('sales.approve', 'sales', 'approve', 'Approve Sales', 315)
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
where pr.permission_code = 'sales.approve'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;
