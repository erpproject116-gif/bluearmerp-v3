-- Acct II: note permissions + default PH withholding codes
begin;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.note_read', 'finance', 'note_read', 'Notes receivable/payable (read)', 90),
  ('finance.note_write', 'finance', 'note_write', 'Notes receivable/payable (write)', 91)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'finance.withholding_read', 'finance.withholding_write',
  'finance.check_read', 'finance.check_write',
  'finance.note_read', 'finance.note_write',
  'finance.landed_cost_read', 'finance.landed_cost_write',
  'finance.contract_read', 'finance.contract_write',
  'finance.budget_read', 'finance.budget_write'
)
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

insert into public.fin_withholding_tax_codes (tenant_id, code, description, rate_pct, active)
select t.id, v.code, v.description, v.rate_pct, true
from public.tenants t
cross join (values
  ('WHT001', 'Creditable withholding 1%', 1.0),
  ('WHT002', 'Creditable withholding 2%', 2.0),
  ('WHT005', 'Creditable withholding 5%', 5.0),
  ('WHT010', 'Creditable withholding 10%', 10.0),
  ('WHT015', 'Creditable withholding 15%', 15.0)
) as v(code, description, rate_pct)
on conflict (tenant_id, code) do nothing;

commit;
