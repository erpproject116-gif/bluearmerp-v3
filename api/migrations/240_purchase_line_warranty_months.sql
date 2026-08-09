-- Per-line warranty duration (total months) for PO and Purchase Receive.
-- Null = fall back to inv_items.warranty_duration_months at receive stamp time.

alter table public.po_purchase_order_lines
  add column if not exists warranty_duration_months integer;

alter table public.fin_supplier_invoice_lines
  add column if not exists warranty_duration_months integer;

comment on column public.po_purchase_order_lines.warranty_duration_months is
  'Total warranty months for serial unit dates; null uses item master at receive.';

comment on column public.fin_supplier_invoice_lines.warranty_duration_months is
  'Total warranty months for serial unit dates; null uses PO line then item master at receive.';
