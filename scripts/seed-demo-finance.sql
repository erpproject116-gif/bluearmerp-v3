-- Demo official receipt applying to demo sale from seed-demo-sales.sql
-- Idempotent: skips when receipt_no already exists for tenant.
-- Run after: migration 017, seed-demo-sales.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_currency_id bigint;
  v_partner_id bigint;
  v_sale_id bigint;
  v_grand_total numeric(18,4);
  v_receipt_id bigint;
  v_bank_id bigint;
  v_d date;
  v_date_seq int;
  v_receipt_no text;
begin
  v_d := current_date;

  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-finance: tenant % missing — skip', v_code;
      continue;
    end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;

    -- Demo sale from seed-demo-sales.sql (YYMMDD201)
    v_receipt_no := to_char(v_d, 'YYMMDD') || '301';

    select s.id, s.partner_id, s.grand_total
    into v_sale_id, v_partner_id, v_grand_total
    from public.sa_sales s
    where s.tenant_id = v_tenant
      and s.sales_no = to_char(v_d, 'YYMMDD') || '201'
      and s.deleted_at is null
    limit 1;

    if v_sale_id is null or v_currency_id is null then
      raise warning 'seed-demo-finance: missing sale or currency for % — skip', v_code;
      continue;
    end if;

    if exists (
      select 1 from public.fin_official_receipts
      where tenant_id = v_tenant and receipt_no = v_receipt_no and deleted_at is null
    ) then
      raise notice 'seed-demo-finance: receipt % already exists for %', v_receipt_no, v_code;
      continue;
    end if;

    select coalesce(max(date_seq), 0) + 1 into v_date_seq
    from public.fin_official_receipts
    where tenant_id = v_tenant and receipt_date = v_d and deleted_at is null;

    insert into public.fin_official_receipts (
      tenant_id, receipt_date, date_seq, receipt_no,
      partner_id, currency_id, payment_method, reference_no, notes,
      amount_total, created_by_user_id
    )
    values (
      v_tenant, v_d, v_date_seq, v_receipt_no,
      v_partner_id, v_currency_id, 'cash', 'DEMO-OR', 'Demo official receipt from seed',
      v_grand_total, v_user_id
    )
    returning id into v_receipt_id;

    insert into public.fin_receipt_applications (official_receipt_id, sales_id, applied_amount)
    values (v_receipt_id, v_sale_id, v_grand_total);

    raise notice 'seed-demo-finance: created OR % for sale % (tenant %)', v_receipt_no, v_sale_id, v_code;

    update public.fin_official_receipts
    set accounting_slip_no = 'CR ' || receipt_no
    where id = v_receipt_id;

    insert into public.fin_bank_accounts (tenant_id, bank_account_code, bank_account_name, gl_account_code, keyword)
    values (v_tenant, 'DEMO-BDO', 'BDO Demo Account', '1026', 'demo')
    on conflict (tenant_id, bank_account_code) do update set bank_account_name = excluded.bank_account_name
    returning id into v_bank_id;

    insert into public.fin_receipt_journal_lines (
      official_receipt_id, line_no, bank_account_id,
      deposit_account_code, deposit_account_name, gl_account_code, gl_account_name, amount
    )
    select r.id, 1, b.id, b.bank_account_code, b.bank_account_name, b.gl_account_code, g.account_name, r.amount_total
    from public.fin_official_receipts r
    join public.fin_bank_accounts b on b.tenant_id = r.tenant_id and b.bank_account_code = 'DEMO-BDO'
    join public.fin_gl_accounts g on g.account_code = b.gl_account_code
    where r.tenant_id = v_tenant and r.receipt_no = to_char(v_d, 'YYMMDD') || '301'
    on conflict (official_receipt_id, line_no) do nothing;

    -- Demo bank statement line (unmatched) for bank reconciliation practice — mirrors OR cash deposit
    if v_bank_id is not null and not exists (
      select 1 from public.fin_bank_statement_lines
      where tenant_id = v_tenant and reference_no = 'DEMO-STMT-OR' and matched_payment_id is null
    ) then
      insert into public.fin_bank_statement_lines (
        tenant_id, bank_account_id, statement_date, reference_no, description, amount
      )
      values (
        v_tenant, v_bank_id, v_d, 'DEMO-STMT-OR', 'Demo bank deposit — match to official receipt', v_grand_total
      );
      raise notice 'seed-demo-finance: bank statement line DEMO-STMT-OR for tenant %', v_code;
    end if;
  end loop;
end $$;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_max_date_seq int;
  v_max_ref_seq int;
  v_d date;
begin
  v_d := current_date;
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select coalesce(max(date_seq), 0) into v_max_date_seq
    from public.fin_official_receipts where tenant_id = v_tenant and receipt_date = v_d and deleted_at is null;

    select coalesce(max(substring(receipt_no from 7)::int), 0) into v_max_ref_seq
    from public.fin_official_receipts
    where tenant_id = v_tenant and receipt_date = v_d and deleted_at is null
      and receipt_no ~ ('^' || to_char(v_d, 'YYMMDD') || '[0-9]{3}$');

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'fin_receipt_date_seq', v_d, v_max_date_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'fin_receipt_no', v_d, v_max_ref_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);
  end loop;
end $$;

commit;
