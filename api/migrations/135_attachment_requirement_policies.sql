-- Tenant toggles for requiring at least one attachment before document confirmation.
alter table public.tenant_process_policies
  add column if not exists quotation_require_attachment boolean not null default true,
  add column if not exists sales_order_require_attachment boolean not null default true,
  add column if not exists sales_require_attachment boolean not null default true,
  add column if not exists purchase_order_require_attachment boolean not null default true,
  add column if not exists supplier_invoice_require_attachment boolean not null default true;
