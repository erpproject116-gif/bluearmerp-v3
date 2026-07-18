-- Allow Simple store / skip-friendly setups: sales & POS must not require Quotation or Sales Order.
-- Cascade was forcing quotation back on whenever sales stayed enabled.
begin;

delete from public.module_dependencies
where module_code = 'sales'
  and depends_on_module_code in ('quotation', 'sales_order');

delete from public.module_dependencies
where module_code = 'sales_order'
  and depends_on_module_code = 'quotation';

delete from public.module_dependencies
where module_code = 'purchase_request'
  and depends_on_module_code = 'quotation';

-- CRM / dashboard / portal can run without quote/SO modules (optional commercial steps).
delete from public.module_dependencies
where module_code = 'crm'
  and depends_on_module_code in ('quotation', 'sales_order');

delete from public.module_dependencies
where module_code = 'dashboard'
  and depends_on_module_code = 'quotation';

delete from public.module_dependencies
where module_code = 'portal'
  and depends_on_module_code = 'sales_order';

commit;
