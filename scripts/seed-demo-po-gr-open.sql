-- Open purchase orders + goods receipts for PO/GR list and serial receive testing
-- Idempotent: stable PO numbers (DEMOGR902–905), safe to re-run.
-- Run after: migrations 040-044, seed-demo-inventory.sql
-- Recommended: seed-demo-quotations.sql or any seed that ensures tax types exist (migration 010 also seeds tax types)
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_loc_hq bigint;
  v_partner bigint;
  v_item bigint;
  v_prid bigint;
  v_pr_line bigint;
  v_poid bigint;
  v_po_line bigint;
  v_grid bigint;
  v_grline bigint;
  v_d date;
  v_serial text;
  v_marker text := 'SEED-PO-GR-OPEN';
  v_line_count int;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and deleted_at is null
    order by case when name = 'Vat Included' then 0 else 1 end, sort_order
    limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_loc_hq from public.inv_locations where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_partner from public.inv_partners where tenant_id = v_tenant and partner_code = '00004' limit 1;
    select id into v_item from public.inv_items where tenant_id = v_tenant and item_code = '00002' limit 1;

    if v_user_id is null then
      raise warning 'seed-demo-po-gr-open: no active user for % — skip', v_code;
      continue;
    end if;
    if v_item is null or v_loc_hq is null or v_partner is null or v_tax_vat is null or v_currency_id is null then
      raise warning 'seed-demo-po-gr-open: missing master data for % (item=%, loc=%, partner=%, tax=%, currency=%) — skip',
        v_code, v_item, v_loc_hq, v_partner, v_tax_vat, v_currency_id;
      continue;
    end if;

    update public.inv_items
    set track_serial = true,
        track_lot = false,
        track_inventory_qty = true,
        warranty_duration_months = coalesce(warranty_duration_months, 24)
    where id = v_item;

    v_d := current_date;

    -- Dedicated PR (stable number, not date-based)
    if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMOPRGR01') then
      insert into public.pr_purchase_requests (
        tenant_id, request_date, date_seq, purchase_request_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        domestic_foreign, send_status, progress_status,
        total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 1, 'DEMOPRGR01',
        v_tax_vat, v_currency_id, v_partner, v_user_id,
        coalesce(u.full_name, 'Demo User'),
        v_loc_hq, 'domestic', 'sent', 'confirmed',
        15, v_marker || ' purchase request for serial receive demos.',
        51535.7143, 6184.2857, 57720.0000, v_user_id
      from public.users u where u.id = v_user_id
      returning id into v_prid;

      insert into public.pr_purchase_request_lines (
        purchase_request_id, line_no, partner_id, partner_code, partner_name,
        item_id, item_code, item_name,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_prid, 1, v_partner, p.partner_code, p.company_name,
        v_item, i.item_code, i.item_name,
        15, 3435.7143, 51535.7143, 6184.2857, 3846.1538, 57720.0000, 'vat_inc_unit'
      from public.inv_partners p, public.inv_items i
      where p.id = v_partner and i.id = v_item
      returning id into v_pr_line;
    else
      select pr.id into v_prid from public.pr_purchase_requests pr
      where pr.tenant_id = v_tenant and pr.purchase_request_no = 'DEMOPRGR01';
      select ln.id into v_pr_line from public.pr_purchase_request_lines ln
      where ln.purchase_request_id = v_prid order by ln.line_no limit 1;
    end if;

    if v_prid is null or v_pr_line is null then
      raise warning 'seed-demo-po-gr-open: PR DEMOPRGR01 missing for % — skip', v_code;
      continue;
    end if;

    -- Helper: ensure PO exists with at least one line (repair header-only rows from partial runs)
    -- PO DEMOGR902: confirmed, 5 open — primary target for Receive / Scan
    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMOGR902') then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        status, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      select v_tenant, v_d, 1, 'DEMOGR902', v_prid,
        v_tax_vat, v_currency_id, v_partner, v_user_id,
        coalesce(u.full_name, 'Demo User'), v_loc_hq,
        'confirmed', v_marker || ' Open PO — scan 5 serials on Receive / Scan.',
        17857.1429, 2142.8571, 20000.0000, v_user_id
      from public.users u where u.id = v_user_id
      returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      values (
        v_poid, v_pr_line, 1, v_partner,
        (select partner_code from public.inv_partners where id = v_partner),
        (select company_name from public.inv_partners where id = v_partner),
        v_item,
        (select item_code from public.inv_items where id = v_item),
        (select item_name from public.inv_items where id = v_item),
        5, 0,
        3571.4286, 17857.1429, 2142.8571, 4000, 20000, 'vat_inc_unit'
      );

      insert into public.pr_purchase_request_slip_lines (purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty)
      values (v_pr_line, 'purchase_order', 'DEMOGR902', 'DEMOGR902', 5);
    end if;

    select id into v_poid from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMOGR902';
    select count(*) into v_line_count from public.po_purchase_order_lines where purchase_order_id = v_poid;
    if v_line_count = 0 then
      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      values (
        v_poid, v_pr_line, 1, v_partner,
        (select partner_code from public.inv_partners where id = v_partner),
        (select company_name from public.inv_partners where id = v_partner),
        v_item,
        (select item_code from public.inv_items where id = v_item),
        (select item_name from public.inv_items where id = v_item),
        5, 0,
        3571.4286, 17857.1429, 2142.8571, 4000, 20000, 'vat_inc_unit'
      );
      update public.po_purchase_orders set status = 'confirmed', notes = v_marker || ' Open PO — scan 5 serials on Receive / Scan.' where id = v_poid;
    end if;

    -- PO DEMOGR903: confirmed, 3 open (second PO for receive testing)
    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMOGR903') then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        status, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      select v_tenant, v_d, 2, 'DEMOGR903', v_prid,
        v_tax_vat, v_currency_id, v_partner, v_user_id,
        coalesce(u.full_name, 'Demo User'), v_loc_hq,
        'confirmed', v_marker || ' Second open PO — scan 3 serials.',
        10714.2857, 1285.7143, 12000.0000, v_user_id
      from public.users u where u.id = v_user_id
      returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      values (
        v_poid, v_pr_line, 1, v_partner,
        (select partner_code from public.inv_partners where id = v_partner),
        (select company_name from public.inv_partners where id = v_partner),
        v_item,
        (select item_code from public.inv_items where id = v_item),
        (select item_name from public.inv_items where id = v_item),
        3, 0,
        3571.4286, 10714.2857, 1285.7143, 4000, 12000, 'vat_inc_unit'
      );

      insert into public.pr_purchase_request_slip_lines (purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty)
      values (v_pr_line, 'purchase_order', 'DEMOGR903', 'DEMOGR903', 3);
    end if;

    -- PO DEMOGR904: partially received (2 posted, 3 still open)
    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMOGR904') then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        status, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      select v_tenant, v_d, 3, 'DEMOGR904', v_prid,
        v_tax_vat, v_currency_id, v_partner, v_user_id,
        coalesce(u.full_name, 'Demo User'), v_loc_hq,
        'partially_received', v_marker || ' Partial receive — 3 units still open.',
        17857.1429, 2142.8571, 20000.0000, v_user_id
      from public.users u where u.id = v_user_id
      returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      values (
        v_poid, v_pr_line, 1, v_partner,
        (select partner_code from public.inv_partners where id = v_partner),
        (select company_name from public.inv_partners where id = v_partner),
        v_item,
        (select item_code from public.inv_items where id = v_item),
        (select item_name from public.inv_items where id = v_item),
        5, 2,
        3571.4286, 17857.1429, 2142.8571, 4000, 20000, 'vat_inc_unit'
      )
      returning id into v_po_line;

      insert into public.pr_purchase_request_slip_lines (purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty)
      values (v_pr_line, 'purchase_order', 'DEMOGR904', 'DEMOGR904', 5);

      insert into public.gr_goods_receipts (tenant_id, purchase_order_id, receipt_date, location_id, status, reference, notes, created_by_user_id)
      values (v_tenant, v_poid, v_d, v_loc_hq, 'posted', 'GR-DEMOGR904', v_marker || ' Posted partial (2 units).', v_user_id)
      returning id into v_grid;

      insert into public.gr_goods_receipt_lines (goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty)
      values (v_grid, v_po_line, 1, 2, 2)
      returning id into v_grline;

      for i in 1..2 loop
        v_serial := upper(v_code) || '-RCV-DEMOGR904-' || lpad(i::text, 2, '0');
        if not exists (select 1 from public.inv_serial_units where tenant_id = v_tenant and serial_no = v_serial) then
          insert into public.inv_serial_units (
            tenant_id, item_id, serial_no, status, location_id,
            purchase_order_line_id, goods_receipt_line_id,
            warranty_start, warranty_end, received_at
          ) values (
            v_tenant, v_item, v_serial, 'in_stock', v_loc_hq,
            v_po_line, v_grline,
            v_d, (v_d + interval '24 months')::date, now()
          );
          insert into public.inv_serial_events (tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id, created_by_user_id)
          select v_tenant, su.id, 'received', v_loc_hq, 'gr_goods_receipt_line', v_grline, v_user_id
          from public.inv_serial_units su where su.tenant_id = v_tenant and su.serial_no = v_serial;
          insert into public.gr_goods_receipt_serials (goods_receipt_line_id, serial_no) values (v_grline, v_serial);
        end if;
      end loop;

      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
      values (v_tenant, v_item, v_loc_hq, 2)
      on conflict (tenant_id, item_id, location_id)
      do update set qty_on_hand = public.inv_item_location_balances.qty_on_hand + 2, updated_at = now();
    end if;

    -- PO DEMOGR905: draft (Purchase Order List — draft tab)
    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMOGR905') then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        status, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      select v_tenant, v_d, 4, 'DEMOGR905', v_prid,
        v_tax_vat, v_currency_id, v_partner, v_user_id,
        coalesce(u.full_name, 'Demo User'), v_loc_hq,
        'draft', v_marker || ' Draft PO — confirm before receive.',
        7142.8571, 857.1429, 8000.0000, v_user_id
      from public.users u where u.id = v_user_id
      returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      values (
        v_poid, v_pr_line, 1, v_partner,
        (select partner_code from public.inv_partners where id = v_partner),
        (select company_name from public.inv_partners where id = v_partner),
        v_item,
        (select item_code from public.inv_items where id = v_item),
        (select item_name from public.inv_items where id = v_item),
        2, 0,
        3571.4286, 7142.8571, 857.1429, 4000, 8000, 'vat_inc_unit'
      );
    end if;

    -- Draft GR on DEMOGR903 for Goods Receipt List (does not block new receipts on DEMOGR902)
    select id into v_poid from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMOGR903';
    if v_poid is not null and not exists (
      select 1 from public.gr_goods_receipts gr
      where gr.tenant_id = v_tenant and gr.purchase_order_id = v_poid and gr.status = 'draft'
    ) then
      select id into v_po_line from public.po_purchase_order_lines where purchase_order_id = v_poid order by line_no limit 1;
      if v_po_line is not null then
        insert into public.gr_goods_receipts (tenant_id, purchase_order_id, receipt_date, location_id, status, reference, notes, created_by_user_id)
        values (v_tenant, v_poid, v_d, v_loc_hq, 'draft', 'GR-DEMOGR903', v_marker || ' Draft GR for list testing.', v_user_id)
        returning id into v_grid;
        insert into public.gr_goods_receipt_lines (goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty)
        values (v_grid, v_po_line, 1, 3, 0);
      end if;
    end if;

    raise notice 'seed-demo-po-gr-open: loaded open POs DEMOGR902–905 for % (tenant_id=%)', v_code, v_tenant;
  end loop;
end $$;

commit;
