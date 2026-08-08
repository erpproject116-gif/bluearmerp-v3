-- Bill-first is the primary buy path: New Bill posts stock + serials on confirm.
-- Turn off Require Purchase Receive before Bill for all existing tenants.
-- New tenants already provision with false; column default remains false.
begin;

update public.tenant_process_policies
set purchase_require_gr_before_supplier_invoice = false,
    updated_at = now()
where purchase_require_gr_before_supplier_invoice = true;

comment on column public.tenant_process_policies.purchase_require_gr_before_supplier_invoice is
  'When true (legacy): Bill lines must come from posted Purchase Receive. Default false = New Bill receives stock/serials on confirm.';

commit;
