-- Demo sales (SI) for DEMO000 + BLUEARM tenants
-- Idempotent: skips each sale by (tenant_id, sales_no).
-- Run after: migration 014, seed-demo-sales-orders.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_loc_hq bigint;
  v_proj bigint;
  v_soid bigint;
  v_soline bigint;
  v_sale_id bigint;
  v_line_id bigint;
  v_ref text;
  v_d date;
  v_date_seq int;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-sales: tenant % missing — skip', v_code;
      continue;
    end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and name = 'Vat Included' and deleted_at is null limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_loc_hq from public.inv_locations
    where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_proj from public.inv_projects
    where tenant_id = v_tenant and project_code = '00001' limit 1;

    if v_tax_vat is null or v_currency_id is null or v_loc_hq is null then
      raise warning 'seed-demo-sales: missing tax/currency/location for % — skip', v_code;
      continue;
    end if;

    -- Sale from released standalone SO (YYMMDD101)
    v_d := current_date;
    v_ref := to_char(v_d, 'YYMMDD') || '201';

    select so.id, sol.id into v_soid, v_soline
    from public.so_sales_orders so
    join public.so_sales_order_lines sol on sol.sales_order_id = so.id and sol.line_no = 1
    where so.tenant_id = v_tenant
      and so.sales_order_no = to_char(v_d, 'YYMMDD') || '101'
      and so.deleted_at is null
    limit 1;

    if v_soid is not null and v_soline is not null
       and not exists (select 1 from public.sa_sales where tenant_id = v_tenant and sales_no = v_ref) then

      select coalesce(max(date_seq), 0) + 1 into v_date_seq
      from public.sa_sales where tenant_id = v_tenant and order_date = v_d and deleted_at is null;

      insert into public.sa_sales (
        tenant_id, order_date, date_seq, sales_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        project_id, due_date, terms_of_payment, payment_terms, si_dr_no, notes,
        progress_status, invoicing_status, template_code, sales_category,
        source_sales_order_id, subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, v_date_seq, v_ref,
        so.tax_type_id, so.currency_id, so.partner_id, so.pic_user_id, so.pic_name, so.location_id,
        so.project_id, so.due_date, '30_days_terms', so.payment_terms, 'BASM SI', so.notes,
        'completed', false, 'default', 'general',
        so.id, so.subtotal, so.tax_total, so.grand_total, v_user_id
      from public.so_sales_orders so where so.id = v_soid
      returning id into v_sale_id;

      insert into public.sa_sales_lines (
        sales_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
        serial_lot_no, source_sales_order_line_id
      )
      select v_sale_id, sol.line_no, sol.item_id, sol.item_code, sol.item_name, sol.description,
        sol.qty, sol.unit_non_vat, sol.non_vat_total, sol.tax_amount, sol.unit_vat_inc, sol.line_total,
        'DEMO-SN-001', sol.id
      from public.so_sales_order_lines sol where sol.id = v_soline
      returning id into v_line_id;

      insert into public.so_sales_order_slip_lines (
        sales_order_line_id, slip_type, slip_ref, slip_date_no, qty, sales_id
      )
      values (
        v_soline, 'sales', v_ref,
        to_char(v_d, 'MM/DD/YYYY') || '-' || v_date_seq::text,
        (select qty from public.so_sales_order_lines where id = v_soline),
        v_sale_id
      );

      update public.so_sales_orders
      set fulfillment_status = 'completed', updated_at = now()
      where id = v_soid;
    end if;

    raise notice 'seed-demo-sales: ensured demo sale for %', v_code;

    -- Demo line discount for Sales Discount Status report
    update public.sa_sales_lines sl
    set discount_amount = 250.00,
        remark = coalesce(nullif(btrim(sl.remark), ''), 'Demo promo discount')
  from public.sa_sales s
    where s.id = sl.sales_id
      and s.tenant_id = v_tenant
      and s.sales_no = v_ref
      and s.deleted_at is null
      and sl.discount_amount = 0;
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
    from public.sa_sales where tenant_id = v_tenant and order_date = v_d and deleted_at is null;

    select coalesce(max(substring(sales_no from 7)::int), 0) into v_max_ref_seq
    from public.sa_sales
    where tenant_id = v_tenant and order_date = v_d and deleted_at is null
      and sales_no ~ ('^' || to_char(v_d, 'YYMMDD') || '[0-9]{3}$');

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'sales_date_seq', v_d, v_max_date_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'sales_no', v_d, v_max_ref_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);
  end loop;
end $$;

commit;
