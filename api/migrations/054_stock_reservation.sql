-- Stock reservation split: qty_reserved on location balances
begin;

alter table public.inv_item_location_balances
  add column if not exists qty_reserved numeric(18,4) not null default 0
    check (qty_reserved >= 0);

create index if not exists idx_inv_item_location_balances_reserved
  on public.inv_item_location_balances (tenant_id, item_id, location_id)
  where qty_reserved > 0;

commit;
