-- Vendor credits (AP credit memo; apply to supplier invoices).
begin;

create table if not exists public.fin_vendor_credits (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  credit_date date not null default current_date,
  date_seq int not null default 1,
  credit_no varchar(40) not null,
  partner_id bigint references public.inv_partners(id),
  vendor_name varchar(255) not null default '',
  source_supplier_invoice_id bigint references public.fin_supplier_invoices(id) on delete set null,
  amount_total numeric(18,4) not null check (amount_total >= 0),
  remaining_amount numeric(18,4) not null check (remaining_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'applied', 'refunded', 'cancelled')),
  reason text not null default '',
  notes text not null default '',
  refunded_at timestamptz,
  refund_method varchar(40),
  refund_reference varchar(255),
  refund_official_receipt_id bigint references public.fin_official_receipts(id) on delete set null,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, credit_no)
);

create index if not exists idx_fin_vendor_credits_tenant_date
  on public.fin_vendor_credits (tenant_id, credit_date desc)
  where deleted_at is null;

create table if not exists public.fin_vendor_credit_applications (
  id bigserial primary key,
  vendor_credit_id bigint not null references public.fin_vendor_credits(id) on delete cascade,
  supplier_invoice_id bigint not null references public.fin_supplier_invoices(id),
  applied_amount numeric(18,4) not null check (applied_amount > 0),
  created_at timestamptz not null default now(),
  unique (vendor_credit_id, supplier_invoice_id)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.vendor_credits', 'finance', 'vendor_credits', 'Vendor Credits', 456),
  ('finance.vendor_credits_write', 'finance', 'vendor_credits_write', 'Vendor Credits (write)', 457)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select tr.tenant_id, tr.role_code, pr.permission_code, 'write'
from public.tenant_roles tr
cross join public.permission_registry pr
where tr.role_code in ('owner', 'admin', 'store_admin', 'member')
  and pr.permission_code in ('finance.vendor_credits', 'finance.vendor_credits_write')
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
