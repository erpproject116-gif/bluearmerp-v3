-- Approval requirement process policy flags
alter table public.tenant_process_policies
  add column if not exists sales_require_so_approval boolean not null default false,
  add column if not exists purchase_require_po_approval boolean not null default false,
  add column if not exists finance_require_je_approval boolean not null default false;
