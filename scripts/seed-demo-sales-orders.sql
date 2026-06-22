-- Demo sales orders for DEMO000 + BLUEARM tenants
-- Idempotent: skips each SO by (tenant_id, sales_order_no).
-- Run after: migration 013, seed-demo-quotations.sql, seed-demo-inventory.sql
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
  v_line_id bigint;
  v_ref text;
  v_d date;
  v_qid bigint;
  v_qln bigint;
  v_item bigint;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-sales-orders: tenant % missing — skip', v_code;
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
      raise warning 'seed-demo-sales-orders: missing tax/currency/location for % — skip', v_code;
      continue;
    end if;

    -- Standalone SO — printer customer (partner 00008)
    v_d := current_date;
    v_ref := to_char(v_d, 'YYMMDD') || '101';
    if not exists (select 1 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = v_ref) then
      insert into public.so_sales_orders (
        tenant_id, order_date, date_seq, sales_order_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        project_id, due_date, delivery_date,
        delivery_remarks, payment_terms, mop, notes,
        progress_status, subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 1, v_ref,
        v_tax_vat, v_currency_id, p.id, v_user_id,
        coalesce(u.full_name, 'Katherine Borinaga'),
        v_loc_hq, v_proj, v_d + 7, v_d + 3,
        'DELIVER THIS WEEK', '30 DAYS', 'BANK TRANSFER', 'Rush order for showroom.',
        'in_progress', 33035.7143, 3964.2857, 37000.0000, v_user_id
      from public.inv_partners p
      left join public.users u on u.id = v_user_id
      where p.tenant_id = v_tenant and p.partner_code = '00008'
      returning id into v_soid;

      insert into public.so_sales_order_lines (
        sales_order_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_soid, 1, i.id, i.item_code, i.item_name,
        'Epson WorkForce Pro WF-C5890 A4 Colour Multifunction Printer',
        1, 33035.7143, 33035.7143, 3964.2857, 37000, 37000
      from public.inv_items i
      where i.tenant_id = v_tenant and i.item_code = '00005'
      returning id into v_line_id;

      insert into public.so_sales_order_release_lines (sales_order_line_id, location_id, release_date, release_qty, created_by_user_id)
      values (v_line_id, v_loc_hq, v_d, 1, v_user_id);

      select i.id into v_item from public.inv_items i where i.tenant_id = v_tenant and i.item_code = '00005';
      if v_item is not null then
        update public.inv_item_location_balances
        set qty_on_hand = greatest(qty_on_hand - 1, 0), updated_at = now()
        where tenant_id = v_tenant and item_id = v_item and location_id = v_loc_hq;

        insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
        select v_tenant, v_item, v_loc_hq, -1, 'so_release', 'so_release_line', rl.id, v_user_id
        from public.so_sales_order_release_lines rl where rl.sales_order_line_id = v_line_id limit 1;
      end if;
    end if;

    -- SO from quotation (partner 00010 — replaces placeholder slip SO-DEMO-001)
    select q.id into v_qid
    from public.quo_quotations q
    join public.inv_partners p on p.id = q.partner_id
    where q.tenant_id = v_tenant and p.partner_code = '00010'
      and q.progress_status = 'in_progress' and q.deleted_at is null
    order by q.order_date desc limit 1;

    if v_qid is not null then
      select ln.id into v_qln from public.quo_quotation_lines ln where ln.quotation_id = v_qid and ln.line_no = 1;
      v_d := current_date;
      v_ref := to_char(v_d, 'YYMMDD') || '102';
      if v_qln is not null and not exists (select 1 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = v_ref) then
        insert into public.so_sales_orders (
          tenant_id, order_date, date_seq, sales_order_no,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          delivery_date, payment_terms, progress_status,
          subtotal, tax_total, grand_total, source_quotation_id, created_by_user_id
        )
        select
          v_tenant, v_d, 2, v_ref,
          q.tax_type_id, q.currency_id, q.partner_id, q.pic_user_id, q.pic_name, q.location_id,
          v_d + 5, '30 days', 'in_progress',
          2678.5714, 321.4286, 3000, v_qid, v_user_id
        from public.quo_quotations q where q.id = v_qid
        returning id into v_soid;

        insert into public.so_sales_order_lines (
          sales_order_id, line_no, item_id, item_code, item_name, description,
          qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
          source_quotation_line_id
        )
        select v_soid, ln.line_no, ln.item_id, ln.item_code, ln.item_name, ln.description,
          ln.qty, ln.unit_non_vat, ln.non_vat_total, ln.tax_amount, ln.unit_vat_inc, ln.line_total,
          ln.id
        from public.quo_quotation_lines ln where ln.id = v_qln;

        delete from public.quo_quotation_slip_lines where quotation_line_id = v_qln;

        insert into public.quo_quotation_slip_lines (quotation_line_id, slip_type, slip_ref, slip_date_no, qty, sales_order_id)
        values (v_qln, 'sales_order', v_ref, to_char(v_d, 'MM/DD/YYYY') || '-2', 1, v_soid);

        update public.quo_quotations set voucher_status = 'partial', updated_at = now() where id = v_qid;
      end if;
    end if;

    raise notice 'seed-demo-sales-orders: ensured demo SO for %', v_code;
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
    from public.so_sales_orders where tenant_id = v_tenant and order_date = v_d and deleted_at is null;

    select coalesce(max(substring(sales_order_no from 7)::int), 0) into v_max_ref_seq
    from public.so_sales_orders
    where tenant_id = v_tenant and order_date = v_d and deleted_at is null
      and sales_order_no ~ ('^' || to_char(v_d, 'YYMMDD') || '[0-9]{3}$');

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'sales_order_date_seq', v_d, v_max_date_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'sales_order_no', v_d, v_max_ref_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);
  end loop;
end $$;

commit;
