-- GR unit costing columns + withholding tax payable GL + commission accrual uniqueness
begin;

alter table public.gr_goods_receipt_lines
  add column if not exists base_unit_cost numeric(18,6) not null default 0,
  add column if not exists landed_unit_cost numeric(18,6) not null default 0,
  add column if not exists unit_cost numeric(18,6) not null default 0;

insert into public.fin_gl_accounts (account_code, account_name, sort_order) values
  ('2360', 'Withholding Tax Payable', 125)
on conflict (account_code) do update
set account_name = excluded.account_name,
    sort_order = excluded.sort_order;

create unique index if not exists uq_sa_commission_accruals_tenant_sale_rule
  on public.sa_commission_accruals (tenant_id, sales_id, rule_id);

commit;
