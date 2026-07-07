-- e-Approval progress status on purchase orders and supplier invoices (ECount list status pills).

alter table public.po_purchase_orders
  add column if not exists progress_status text not null default 'unconfirmed';

alter table public.po_purchase_orders drop constraint if exists po_purchase_orders_progress_status_check;

alter table public.po_purchase_orders
  add constraint po_purchase_orders_progress_status_check
  check (progress_status in ('unconfirmed', 'e_approval', 'completed'));

update public.po_purchase_orders
set progress_status = case when status = 'draft' then 'unconfirmed' else 'completed' end;

alter table public.fin_supplier_invoices
  add column if not exists progress_status text not null default 'unconfirmed';

alter table public.fin_supplier_invoices drop constraint if exists fin_supplier_invoices_progress_status_check;

alter table public.fin_supplier_invoices
  add constraint fin_supplier_invoices_progress_status_check
  check (progress_status in ('unconfirmed', 'e_approval', 'completed'));

update public.fin_supplier_invoices
set progress_status = 'completed'
where deleted_at is null;

create index if not exists idx_po_purchase_orders_progress
  on public.po_purchase_orders (tenant_id, progress_status)
  where deleted_at is null;

create index if not exists idx_fin_supplier_invoices_progress
  on public.fin_supplier_invoices (tenant_id, progress_status)
  where deleted_at is null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order)
values
  ('purchase_order.approve', 'purchase_order', 'approve', 'Approve Purchase Orders', 415),
  ('finance.supplier_invoices_approve', 'finance', 'supplier_invoices_approve', 'Approve Supplier Invoices', 515)
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
where pr.permission_code in ('purchase_order.approve', 'finance.supplier_invoices_approve')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;
