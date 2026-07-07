-- Phase 4: QC requests + report permissions
begin;

create table if not exists public.qms_qc_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  request_no varchar(30) not null,
  request_date date not null default current_date,
  source_type varchar(30) not null check (source_type in ('goods_receipt', 'supplier_invoice')),
  goods_receipt_id bigint references public.gr_goods_receipts(id) on delete set null,
  supplier_invoice_id bigint references public.fin_supplier_invoices(id) on delete set null,
  partner_name text,
  item_code varchar(15),
  item_name text,
  notes text,
  progress_status varchar(20) not null default 'unconfirmed'
    check (progress_status in ('e_approval', 'unconfirmed', 'in_progress', 'completed')),
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, request_no)
);

create index if not exists idx_qms_qc_requests_list
  on public.qms_qc_requests (tenant_id, progress_status, request_date desc);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('quality.qc_requests', 'quality', 'qc_requests', 'QC Requests', 15),
  ('buying.purchase_status', 'buying', 'purchase_status', 'Purchase Status', 10),
  ('selling.sales_reports', 'selling', 'sales_reports', 'Selling Reports', 10)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('quality.qc_requests', 'buying.purchase_status', 'selling.sales_reports')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
