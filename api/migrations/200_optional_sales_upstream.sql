-- Make Quotation and Sales Order optional for New Sales (skip-friendly defaults).
-- Load Slip can still pull from quote/SO when desired; free item lines are allowed.
begin;

update public.tenant_process_policies
set
  sales_require_quotation = false,
  sales_require_so = false,
  updated_at = now()
where sales_require_quotation = true
   or sales_require_so = true;

commit;
