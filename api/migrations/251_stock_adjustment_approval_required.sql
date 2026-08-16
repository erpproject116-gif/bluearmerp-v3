-- Stock quantity adjustments always require store-admin / owner confirmation.
-- Enforce policy ON for all tenants (API also ignores the off path).

alter table public.tenant_process_policies
  alter column inventory_require_stock_adjustment_approval set default true;

update public.tenant_process_policies
set inventory_require_stock_adjustment_approval = true
where inventory_require_stock_adjustment_approval is distinct from true;

comment on column public.tenant_process_policies.inventory_require_stock_adjustment_approval is
  'Stock quantity adjustments always require approval before inventory updates. Kept true for all tenants.';
