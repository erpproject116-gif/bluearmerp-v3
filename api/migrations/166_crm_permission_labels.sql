-- Clarify CRM feature labels in User Management (nav already renamed in web).
begin;

update public.permission_registry
set label = 'Quote board'
where permission_code = 'crm.pipelines_quotations';

update public.permission_registry
set label = 'Warranty coverage'
where permission_code = 'crm.warranty_assets';

commit;
