-- Demo quotations for DEMO000 + BLUEARM tenants
-- Realistic Philippines B2B scenarios: multiple customers, lines, progress states,
-- validity windows, and one partial slip for Outstanding Quote testing.
-- Idempotent: skips each quote by (tenant_id, reference_no).
-- Run after: migrations 010–011, seed-demo-inventory.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_tax_vat bigint;
  v_tax_none bigint;
  v_currency_id bigint;
  v_loc_hq bigint;
  v_proj bigint;
  v_qid bigint;
  v_ref text;
  v_d date;
begin
  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-quotations: tenant % missing — skip', v_code;
      continue;
    end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and name = 'Vat Included' and deleted_at is null limit 1;
    select id into v_tax_none from public.quo_tax_types
    where tenant_id = v_tenant and name = 'Non-VAT' and deleted_at is null limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_loc_hq from public.inv_locations
    where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_proj from public.inv_projects
    where tenant_id = v_tenant and project_code = '00001' limit 1;

    if v_tax_vat is null or v_currency_id is null or v_loc_hq is null then
      raise warning 'seed-demo-quotations: missing tax/currency/location for % — skip', v_code;
      continue;
    end if;

    -- Quote A — medical / hospitality customer, printer line (37,000 vat-inc)
    v_d := current_date;
    v_ref := to_char(v_d, 'YYMMDD') || '001';
    if not exists (select 1 from public.quo_quotations where tenant_id = v_tenant and reference_no = v_ref) then
      insert into public.quo_quotations (
        tenant_id, order_date, date_seq, reference_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        project_id, project_name,
        quotation_validity_text, validity_days, valid_until,
        payment_terms, note_for_pic_only, notes,
        progress_status, voucher_status, subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 1, v_ref,
        v_tax_vat, v_currency_id, p.id, v_user_id,
        coalesce(u.full_name, 'Nel Tristan Juarez'),
        v_loc_hq, v_proj, pr.project_name,
        '2 DAYS', 2, v_d + 2,
        '30 days',
        'Follow up with procurement after validity.',
        E'Note: ORDER BASIS 20-25 DAYS\nImportant Notes: All quotations are strictly valid for two (2) days only.\nPRICES ARE SUBJECT TO CHANGE WITHOUT PRIOR NOTICE.',
        'unconfirmed', 'none', 33035.7143, 3964.2857, 37000.0000, v_user_id
      from public.inv_partners p
      left join public.users u on u.id = v_user_id
      left join public.inv_projects pr on pr.id = v_proj
      where p.tenant_id = v_tenant and p.partner_code = '00008'
      returning id into v_qid;

      insert into public.quo_quotation_lines (
        quotation_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark
      )
      select v_qid, 1, i.id, i.item_code, i.item_name,
        'Epson WorkForce Pro WF-C5890 A4 Colour Multifunction Printer',
        1, 33035.7143, 33035.7143, 3964.2857, 37000, 37000, null
      from public.inv_items i
      where i.tenant_id = v_tenant and i.item_code = '00001';
    end if;

    -- Quote B — SM Retail fit-out (in progress, multi-line)
    v_d := current_date;
    v_ref := to_char(v_d, 'YYMMDD') || '002';
    if not exists (select 1 from public.quo_quotations where tenant_id = v_tenant and reference_no = v_ref) then
      insert into public.quo_quotations (
        tenant_id, order_date, date_seq, reference_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        project_id, quotation_validity_text, validity_days, valid_until,
        payment_terms, notes, progress_status, voucher_status,
        subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 2, v_ref,
        v_tax_vat, v_currency_id, p.id, v_user_id,
        coalesce(u.full_name, 'Demo Sales'),
        v_loc_hq, v_proj,
        '7 DAYS', 7, v_d + 7,
        '50% down, 50% on delivery',
        'Kiosk batch — confirm finishes with client before PO.',
        'in_progress', 'none',
        11785.7143, 1414.2857, 13200.0000, v_user_id
      from public.inv_partners p
      left join public.users u on u.id = v_user_id
      where p.tenant_id = v_tenant and p.partner_code = '00001'
      returning id into v_qid;

      insert into public.quo_quotation_lines (
        quotation_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark
      )
      select v_qid, v.line_no, i.id, i.item_code, i.item_name, v.description,
        v.qty, v.unit_non_vat, v.non_vat_total, v.tax_amount, v.unit_vat_inc, v.line_total, v.remark
      from (values
        (1, '00006', 'Dining set — walnut top for SM kiosk', 1::numeric,
         4821.4286, 4821.4286, 578.5714, 5400, 5400, 'Include edge banding'),
        (2, '00007', 'Cabinet carcass 600mm — display base', 2::numeric,
         3482.1429, 6964.2858, 835.7142, 3900, 7800, null)
      ) as v(line_no, item_code, description, qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark)
      join public.inv_items i on i.tenant_id = v_tenant and i.item_code = v.item_code;
    end if;

    -- Quote C — Ayala (completed, 14 days ago)
    v_d := current_date - 14;
    v_ref := to_char(v_d, 'YYMMDD') || '001';
    if not exists (select 1 from public.quo_quotations where tenant_id = v_tenant and reference_no = v_ref) then
      insert into public.quo_quotations (
        tenant_id, order_date, date_seq, reference_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        quotation_validity_text, validity_days, valid_until,
        notes, progress_status, voucher_status,
        subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 1, v_ref,
        v_tax_vat, v_currency_id, p.id, v_user_id, 'Roberto Mendoza',
        v_loc_hq, '14 DAYS', 14, v_d + 14,
        'Converted to PO — archived for reference.',
        'completed', 'completed',
        8750, 1050, 9800, v_user_id
      from public.inv_partners p
      where p.tenant_id = v_tenant and p.partner_code = '00002'
      returning id into v_qid;

      insert into public.quo_quotation_lines (
        quotation_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_qid, 1, i.id, i.item_code, i.item_name,
        'Mattress pocket spring — executive lounge sample room',
        1, 8750, 8750, 1050, 9800, 9800
      from public.inv_items i
      where i.tenant_id = v_tenant and i.item_code = '00009';
    end if;

    -- Quote D — Robinsons (partial slip: qty 3, fulfilled 1 → balance 2 for Outstanding)
    v_d := current_date - 3;
    v_ref := to_char(v_d, 'YYMMDD') || '001';
    if not exists (select 1 from public.quo_quotations where tenant_id = v_tenant and reference_no = v_ref) then
      insert into public.quo_quotations (
        tenant_id, order_date, date_seq, reference_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        quotation_validity_text, validity_days, valid_until,
        progress_status, voucher_status,
        subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 1, v_ref,
        v_tax_vat, v_currency_id, p.id, v_user_id, 'Andrea Flores',
        v_loc_hq, '5 DAYS', 5, v_d + 5,
        'in_progress', 'partial',
        2678.5714, 321.4286, 3000, v_user_id
      from public.inv_partners p
      where p.tenant_id = v_tenant and p.partner_code = '00010'
      returning id into v_qid;

      insert into public.quo_quotation_lines (
        quotation_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_qid, 1, i.id, i.item_code, i.item_name,
        'Oak veneer panel 18mm — gondola cladding',
        3, 892.8571, 2678.5714, 321.4286, 1000, 3000
      from public.inv_items i
      where i.tenant_id = v_tenant and i.item_code = '00002';

      insert into public.quo_quotation_slip_lines (quotation_line_id, slip_type, slip_ref, slip_date_no, qty)
      select ln.id, 'sales_order', 'SO-DEMO-001', to_char(v_d + 1, 'MM/DD/YYYY') || '-1', 1
      from public.quo_quotation_lines ln
      where ln.quotation_id = v_qid and ln.line_no = 1;
    end if;

    -- Quote E — Vista (Non-VAT labor), yesterday
    if v_tax_none is not null then
      v_d := current_date - 1;
      v_ref := to_char(v_d, 'YYMMDD') || '002';
      if not exists (select 1 from public.quo_quotations where tenant_id = v_tenant and reference_no = v_ref) then
        insert into public.quo_quotations (
          tenant_id, order_date, date_seq, reference_no,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          quotation_validity_text, validity_days, valid_until,
          progress_status, subtotal, tax_total, grand_total, created_by_user_id
        )
        select
          v_tenant, v_d, 2, v_ref,
          v_tax_none, v_currency_id, p.id, v_user_id, 'Carla Reyes',
          v_loc_hq, '3 DAYS', 3, v_d + 3,
          'unconfirmed', 7000, 0, 7000, v_user_id
        from public.inv_partners p
        where p.tenant_id = v_tenant and p.partner_code = '00003'
        returning id into v_qid;

        insert into public.quo_quotation_lines (
          quotation_id, line_no, item_id, item_code, item_name, description,
          qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
        )
        select v_qid, 1, i.id, i.item_code, i.item_name,
          'On-site install labor — model unit Type B',
          2, 3500, 7000, 0, 3500, 7000
        from public.inv_items i
        where i.tenant_id = v_tenant and i.item_code = '00010';
      end if;
    end if;

    raise notice 'seed-demo-quotations: ensured demo quotes for %', v_code;
  end loop;
end $$;

-- Sync daily sequence counters for today (new quotes get next seq after seeded rows)
do $$
declare
  v_tenant bigint;
  v_code text;
  v_max_date_seq int;
  v_max_ref_seq int;
  v_d date;
begin
  v_d := current_date;
  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select coalesce(max(date_seq), 0) into v_max_date_seq
    from public.quo_quotations where tenant_id = v_tenant and order_date = v_d and deleted_at is null;

    select coalesce(max(
      substring(reference_no from 7)::int
    ), 0) into v_max_ref_seq
    from public.quo_quotations
    where tenant_id = v_tenant and order_date = v_d and deleted_at is null
      and reference_no ~ ('^' || to_char(v_d, 'YYMMDD') || '[0-9]{3}$');

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'quotation_date_seq', v_d, v_max_date_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'quotation_reference_no', v_d, v_max_ref_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);
  end loop;
end $$;

commit;
