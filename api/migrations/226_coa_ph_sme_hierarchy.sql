-- Zoho-like PH SME CoA hierarchy: group headers + parent_id on leaf accounts.
-- Does not renumber posting leaves (1010, 1100, … stay the same).
begin;

-- Group header codes that do not collide with existing posting leaves.
create or replace function public.apply_ph_sme_coa_hierarchy(p_tenant bigint)
returns void
language plpgsql
as $$
declare
  g_assets bigint;
  g_cash bigint;
  g_recv bigint;
  g_inv bigint;
  g_oca bigint;
  g_ppe bigint;
  g_liab bigint;
  g_pay bigint;
  g_tax bigint;
  g_loan bigint;
  g_eq bigint;
  g_inc bigint;
  g_exp bigint;
  g_cogs bigint;
  g_opex bigint;
begin
  -- Insert group headers (is_group = true). Codes chosen to avoid leaf collisions.
  insert into public.fin_accounts (tenant_id, account_code, account_name, account_type, is_group, is_system, sort_order)
  values
    (p_tenant, '1000', 'Assets', 'asset', true, true, 1),
    (p_tenant, '1005', 'Cash & Bank', 'asset', true, true, 5),
    (p_tenant, '1095', 'Receivables', 'asset', true, true, 90),
    (p_tenant, '1195', 'Inventory', 'asset', true, true, 190),
    (p_tenant, '1295', 'Other Current Assets', 'asset', true, true, 290),
    (p_tenant, '1495', 'Property & Equipment', 'asset', true, true, 490),
    (p_tenant, '2000', 'Liabilities', 'liability', true, true, 1000),
    (p_tenant, '2005', 'Payables', 'liability', true, true, 1005),
    (p_tenant, '2025', 'Tax & Statutory Payables', 'liability', true, true, 1025),
    (p_tenant, '2095', 'Loans Payable', 'liability', true, true, 1095),
    (p_tenant, '3000', 'Equity', 'equity', true, true, 2000),
    (p_tenant, '4000', 'Income', 'income', true, true, 3000),
    (p_tenant, '5000', 'Expenses', 'expense', true, true, 4000),
    (p_tenant, '5005', 'Cost of Sales', 'expense', true, true, 4005),
    (p_tenant, '5095', 'Operating Expenses', 'expense', true, true, 4095)
  on conflict (tenant_id, account_code) do update set
    account_name = excluded.account_name,
    is_group = true,
    is_system = true,
    deleted_at = null;

  select id into g_assets from public.fin_accounts where tenant_id = p_tenant and account_code = '1000' and deleted_at is null;
  select id into g_cash from public.fin_accounts where tenant_id = p_tenant and account_code = '1005' and deleted_at is null;
  select id into g_recv from public.fin_accounts where tenant_id = p_tenant and account_code = '1095' and deleted_at is null;
  select id into g_inv from public.fin_accounts where tenant_id = p_tenant and account_code = '1195' and deleted_at is null;
  select id into g_oca from public.fin_accounts where tenant_id = p_tenant and account_code = '1295' and deleted_at is null;
  select id into g_ppe from public.fin_accounts where tenant_id = p_tenant and account_code = '1495' and deleted_at is null;
  select id into g_liab from public.fin_accounts where tenant_id = p_tenant and account_code = '2000' and deleted_at is null;
  select id into g_pay from public.fin_accounts where tenant_id = p_tenant and account_code = '2005' and deleted_at is null;
  select id into g_tax from public.fin_accounts where tenant_id = p_tenant and account_code = '2025' and deleted_at is null;
  select id into g_loan from public.fin_accounts where tenant_id = p_tenant and account_code = '2095' and deleted_at is null;
  select id into g_eq from public.fin_accounts where tenant_id = p_tenant and account_code = '3000' and deleted_at is null;
  select id into g_inc from public.fin_accounts where tenant_id = p_tenant and account_code = '4000' and deleted_at is null;
  select id into g_exp from public.fin_accounts where tenant_id = p_tenant and account_code = '5000' and deleted_at is null;
  select id into g_cogs from public.fin_accounts where tenant_id = p_tenant and account_code = '5005' and deleted_at is null;
  select id into g_opex from public.fin_accounts where tenant_id = p_tenant and account_code = '5095' and deleted_at is null;

  -- Nest mid-level groups under top-level type groups
  update public.fin_accounts set parent_id = g_assets where tenant_id = p_tenant and account_code in ('1005','1095','1195','1295','1495') and deleted_at is null;
  update public.fin_accounts set parent_id = g_liab where tenant_id = p_tenant and account_code in ('2005','2025','2095') and deleted_at is null;
  update public.fin_accounts set parent_id = g_exp where tenant_id = p_tenant and account_code in ('5005','5095') and deleted_at is null;

  -- Re-parent posting leaves (no code renumber)
  update public.fin_accounts set parent_id = g_cash
    where tenant_id = p_tenant and account_code in ('1010','1020','1030','1031','1032','1033') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_recv
    where tenant_id = p_tenant and account_code in ('1100','1110') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_inv
    where tenant_id = p_tenant and account_code in ('1200') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_oca
    where tenant_id = p_tenant and account_code in ('1300','1310') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_ppe
    where tenant_id = p_tenant and account_code in ('1500','1510') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_pay
    where tenant_id = p_tenant and account_code in ('2010','2020') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_tax
    where tenant_id = p_tenant and account_code in ('2030','2040','2050','2051','2360') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_loan
    where tenant_id = p_tenant and account_code in ('2100') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_eq
    where tenant_id = p_tenant and account_code in ('3010','3020','3090','3099') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_inc
    where tenant_id = p_tenant and account_code in ('4010','4020','4030') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_cogs
    where tenant_id = p_tenant and account_code in ('5010') and deleted_at is null and coalesce(is_group,false) = false;
  update public.fin_accounts set parent_id = g_opex
    where tenant_id = p_tenant and account_code in ('5100','5105','5110','5120','5130','5140','5150','5160','5170','5180','5190')
      and deleted_at is null and coalesce(is_group,false) = false;
end;
$$;

-- Apply hierarchy to every tenant that already has PH SME leaves (e.g. 1010 Cash on Hand).
do $$
declare
  r record;
begin
  for r in
    select distinct tenant_id as id
    from public.fin_accounts
    where account_code = '1010' and deleted_at is null
  loop
    perform public.apply_ph_sme_coa_hierarchy(r.id);
  end loop;
end;
$$;

-- Wrap seed so new imports get hierarchy after flat insert.
create or replace function public.seed_ph_sme_chart_of_accounts_with_hierarchy(p_tenant bigint)
returns void
language plpgsql
as $$
begin
  perform public.seed_ph_sme_chart_of_accounts(p_tenant);
  perform public.apply_ph_sme_coa_hierarchy(p_tenant);
end;
$$;

commit;
