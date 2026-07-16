-- Replace legacy full Bluearm CoA on demo tenants with the PH SME market template.
-- Soft-deletes existing accounts (keeps FK history), then seeds/revives PH codes.
begin;

create or replace function public.seed_ph_sme_chart_of_accounts(p_tenant bigint)
returns void
language plpgsql
as $$
declare
  v_cash bigint;
  v_recv bigint;
  v_pay bigint;
  v_sales bigint;
  v_purchase bigint;
  v_in_vat bigint;
  v_out_vat bigint;
begin
  insert into public.fin_accounts (tenant_id, account_code, account_name, account_type, is_system, sort_order)
  select p_tenant, v.code, v.name, v.atype, true, (row_number() over ())::int * 10
  from (values
    ('1010','Cash on Hand','asset'),
    ('1020','Petty Cash Fund','asset'),
    ('1030','Cash in Bank','asset'),
    ('1031','BDO Savings','asset'),
    ('1032','BPI Checking','asset'),
    ('1033','GCash / Maya','asset'),
    ('1100','Accounts Receivable - Trade','asset'),
    ('1110','Allowance for Doubtful Accounts','asset'),
    ('1200','Inventory - Merchandise','asset'),
    ('1300','Prepaid Expenses','asset'),
    ('1310','Input VAT','asset'),
    ('1500','Property & Equipment','asset'),
    ('1510','Accumulated Depreciation','asset'),
    ('2010','Accounts Payable - Trade','liability'),
    ('2020','Accrued Expenses','liability'),
    ('2030','Output VAT','liability'),
    ('2040','Withholding Tax Payable','liability'),
    ('2050','SSS / PhilHealth / Pag-IBIG Payable','liability'),
    ('2100','Loans Payable - Short Term','liability'),
    ('3010','Owner''s Capital','equity'),
    ('3020','Owner''s Drawings','equity'),
    ('3090','Retained Earnings','equity'),
    ('3099','Current Year Profit or Loss','equity'),
    ('4010','Sales - Goods','income'),
    ('4020','Sales - Services','income'),
    ('4030','Sales Returns & Allowances','income'),
    ('5010','Cost of Goods Sold','expense'),
    ('5100','Salaries & Wages','expense'),
    ('5110','SSS / PhilHealth / Pag-IBIG - Employer Share','expense'),
    ('5120','Rent Expense','expense'),
    ('5130','Utilities','expense'),
    ('5140','Office Supplies','expense'),
    ('5150','Professional Fees','expense'),
    ('5160','Depreciation Expense','expense'),
    ('5170','Bad Debts Expense','expense'),
    ('5180','Bank Charges & Interest','expense'),
    ('5190','Miscellaneous Expense','expense')
  ) as v(code, name, atype)
  on conflict (tenant_id, account_code) do update set
    account_name = excluded.account_name,
    account_type = excluded.account_type,
    is_system = true,
    deleted_at = null,
    is_active = true;

  update public.fin_accounts
  set account_type = 'liability'
  where tenant_id = p_tenant and account_code = '2010' and account_type <> 'liability';

  select id into v_cash from public.fin_accounts where tenant_id = p_tenant and account_code = '1010' and deleted_at is null;
  select id into v_recv from public.fin_accounts where tenant_id = p_tenant and account_code = '1100' and deleted_at is null;
  select id into v_pay from public.fin_accounts where tenant_id = p_tenant and account_code = '2010' and deleted_at is null;
  select id into v_sales from public.fin_accounts where tenant_id = p_tenant and account_code = '4010' and deleted_at is null;
  select id into v_purchase from public.fin_accounts where tenant_id = p_tenant and account_code = '5010' and deleted_at is null;
  select id into v_in_vat from public.fin_accounts where tenant_id = p_tenant and account_code = '1310' and deleted_at is null;
  select id into v_out_vat from public.fin_accounts where tenant_id = p_tenant and account_code = '2030' and deleted_at is null;

  insert into public.tenant_finance_defaults (
    tenant_id, cash_account_id, receivable_account_id, payable_account_id,
    sales_account_id, purchase_account_id, input_vat_account_id, output_vat_account_id
  ) values (p_tenant, v_cash, v_recv, v_pay, v_sales, v_purchase, v_in_vat, v_out_vat)
  on conflict (tenant_id) do update set
    cash_account_id = coalesce(excluded.cash_account_id, tenant_finance_defaults.cash_account_id),
    receivable_account_id = coalesce(excluded.receivable_account_id, tenant_finance_defaults.receivable_account_id),
    payable_account_id = coalesce(excluded.payable_account_id, tenant_finance_defaults.payable_account_id),
    sales_account_id = coalesce(excluded.sales_account_id, tenant_finance_defaults.sales_account_id),
    purchase_account_id = coalesce(excluded.purchase_account_id, tenant_finance_defaults.purchase_account_id),
    input_vat_account_id = coalesce(excluded.input_vat_account_id, tenant_finance_defaults.input_vat_account_id),
    output_vat_account_id = coalesce(excluded.output_vat_account_id, tenant_finance_defaults.output_vat_account_id),
    updated_at = now();
end;
$$;

do $$
declare
  r record;
begin
  for r in select id, company_code from public.tenants where is_demo = true
  loop
    update public.fin_accounts
    set deleted_at = now(), is_active = false
    where tenant_id = r.id and deleted_at is null;

    perform public.seed_ph_sme_chart_of_accounts(r.id);

    raise notice '171: demo tenant % (%) switched to PH SME chart', r.company_code, r.id;
  end loop;
end $$;

commit;
