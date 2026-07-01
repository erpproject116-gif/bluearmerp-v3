-- Permission action flags per role (submit/cancel beyond read/write).
begin;

alter table public.tenant_role_permissions
  add column if not exists can_submit boolean not null default false,
  add column if not exists can_cancel boolean not null default false;

-- Existing write grants imply submit for transactional modules
update public.tenant_role_permissions
set can_submit = true
where access_level = 'write'
  and permission_code ~ '^(sales_order|purchase_order|purchase_request|sales|finance|delivery)';

update public.tenant_role_permissions
set can_cancel = true
where access_level = 'write'
  and permission_code ~ '^(sales_order|purchase_order|purchase_request|sales|finance)';

commit;
