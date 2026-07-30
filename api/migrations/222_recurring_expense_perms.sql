-- Recurring expenses: dedicated permissions (stop overloading finance.contract_*).
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.recurring_expenses', 'finance', 'recurring_expenses', 'Recurring Expenses', 447),
  ('finance.recurring_expenses_write', 'finance', 'recurring_expenses_write', 'Recurring Expenses (write)', 448)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select tr.tenant_id, tr.role_code, pr.permission_code, 'write'
from public.tenant_roles tr
cross join public.permission_registry pr
where tr.role_code in ('owner', 'admin', 'store_admin', 'member')
  and pr.permission_code in ('finance.recurring_expenses', 'finance.recurring_expenses_write')
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
