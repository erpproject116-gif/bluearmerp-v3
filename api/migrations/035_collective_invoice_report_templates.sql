-- Add sales_collective_invoice_status report template key
begin;

alter table public.tenant_report_templates
  drop constraint if exists tenant_report_templates_report_key_check;

alter table public.tenant_report_templates
  add constraint tenant_report_templates_report_key_check
  check (report_key in (
    'sales_discount_status',
    'sales_status',
    'sales_order_status',
    'official_receipt_status',
    'sales_collective_invoice_status'
  ));

commit;
