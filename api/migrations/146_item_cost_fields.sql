-- Item master Cost tab: O/E price and standard cost breakdown (ECount Cost pill parity).
begin;

alter table public.inv_items
  add column if not exists oe_price numeric(18,4) not null default 0,
  add column if not exists standard_costs jsonb not null default '{"material":0,"labor":0,"expenses":0,"overhead":0}'::jsonb;

comment on column public.inv_items.oe_price is 'O/E (other/expense) unit cost for item master Cost tab.';
comment on column public.inv_items.standard_costs is 'Standard cost breakdown: material, labor, expenses, overhead.';

commit;
