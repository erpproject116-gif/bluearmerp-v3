-- Coverage decision is the approval before a repair can return a unit to sellable stock.
-- Supplier recovery is a record only. It does not move stock or rewrite sold coverage.

alter table public.inv_repair_orders
  add column if not exists coverage_decision text not null default 'pending',
  add column if not exists supplier_recovery text not null default 'none';

alter table public.inv_repair_orders
  drop constraint if exists inv_repair_orders_coverage_decision_check;

alter table public.inv_repair_orders
  add constraint inv_repair_orders_coverage_decision_check
  check (coverage_decision in ('pending', 'covered', 'denied', 'goodwill'));

alter table public.inv_repair_orders
  drop constraint if exists inv_repair_orders_supplier_recovery_check;

alter table public.inv_repair_orders
  add constraint inv_repair_orders_supplier_recovery_check
  check (supplier_recovery in ('none', 'requested', 'recovered'));
