-- Golden demo scenarios: wired document chains (serial S2, lot S3, direct S4, S9 DR, S10 PR)
-- Idempotent: stable document numbers (DEMO-S2-*, DEMO-S3-*, DEMO-S4-*, DEMO-S9-*, DEMO-S10-*)
-- Run after: seed-demo-inventory.sql, seed-demo-quotations.sql (optional), seed-demo-purchase-requests.sql (optional)
-- Uses fixed date 2025-06-15 and distinct date_seq per document type on that date:
--   PR: S2=1, S3=2, S10=10, S10-OK=11 | SO: S2=1, S9=9 | SI: S2=1, S3=2, S4=3, S9=9 | DR: S9=9
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_loc_hq bigint;
  v_partner_vendor bigint;
  v_partner_sm bigint;
  v_item_oak bigint;
  v_item_fabric bigint;
  v_item_foam bigint;
  v_prid bigint;
  v_pr_line bigint;
  v_poid bigint;
  v_po_line bigint;
  v_grid bigint;
  v_grline bigint;
  v_soid bigint;
  v_soline bigint;
  v_release_line bigint;
  v_sale_id bigint;
  v_sale_line bigint;
  v_serial_id bigint;
  v_serial text;
  v_d date;
  v_i int;
  v_unit_ids bigint[] := array[]::bigint[];
  v_lot_batch bigint;
  v_prid3 bigint;
  v_pr_line3 bigint;
  v_poid3 bigint;
  v_po_line3 bigint;
  v_grid3 bigint;
  v_grline3 bigint;
  v_drid bigint;
  v_soid9 bigint;
  v_soline9 bigint;
  v_release_line9 bigint;
begin
  -- Stable anchor date for all DEMO-S* documents (not current_date).
  v_d := date '2025-06-15';

  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and deleted_at is null
    order by case when name = 'Vat Included' then 0 else 1 end, sort_order limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_loc_hq from public.inv_locations where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_partner_vendor from public.inv_partners where tenant_id = v_tenant and partner_code = '00004' limit 1;
    select id into v_partner_sm from public.inv_partners where tenant_id = v_tenant and partner_code = '00001' limit 1;
    select id into v_item_oak from public.inv_items where tenant_id = v_tenant and item_code = '00002' limit 1;
    select id into v_item_fabric from public.inv_items where tenant_id = v_tenant and item_code = '00004' limit 1;
    select id into v_item_foam from public.inv_items where tenant_id = v_tenant and item_code = '00003' limit 1;

    if v_user_id is null or v_tax_vat is null or v_currency_id is null or v_loc_hq is null
       or v_partner_vendor is null or v_partner_sm is null or v_item_oak is null then
      raise warning 'seed-demo-golden-scenarios: missing master data for % — skip', v_code;
      continue;
    end if;

    -- === S2: serial chain PR → PO → GR → SO release → SI ===
    update public.inv_items
    set track_serial = true, track_lot = false, track_inventory_qty = true,
        warranty_duration_months = coalesce(warranty_duration_months, 24)
    where id = v_item_oak;

    if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S2-PR') then
      insert into public.pr_purchase_requests (
        tenant_id, request_date, date_seq, purchase_request_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        domestic_foreign, send_status, progress_status,
        total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      values (
        v_tenant, v_d, 1, 'DEMO-S2-PR',
        v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
        v_loc_hq, 'domestic', 'sent', 'confirmed',
        5, 'GOLDEN-S2 internal PR for oak panel serial chain.',
        8928.5715, 1071.4285, 10000.0000, v_user_id
      ) returning id into v_prid;

      insert into public.pr_purchase_request_lines (
        purchase_request_id, line_no, partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_prid, 1, v_partner_vendor, p.partner_code, p.company_name,
        v_item_oak, i.item_code, i.item_name, 5,
        1785.7143, 8928.5715, 1071.4285, 2000, 10000, 'vat_inc_unit'
      from public.inv_partners p, public.inv_items i
      where p.id = v_partner_vendor and i.id = v_item_oak
      returning id into v_pr_line;
    else
      select id into v_prid from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S2-PR';
      select id into v_pr_line from public.pr_purchase_request_lines where purchase_request_id = v_prid order by line_no limit 1;
    end if;

    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMO-S2-PO') then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        status, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      values (
        v_tenant, v_d, 1, 'DEMO-S2-PO', v_prid,
        v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
        v_loc_hq, 'received', 'GOLDEN-S2 PO for serial receive chain.',
        8928.5715, 1071.4285, 10000.0000, v_user_id
      ) returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_poid, v_pr_line, 1, v_partner_vendor, p.partner_code, p.company_name,
        v_item_oak, i.item_code, i.item_name, 5, 5,
        1785.7143, 8928.5715, 1071.4285, 2000, 10000, 'vat_inc_unit'
      from public.inv_partners p, public.inv_items i
      where p.id = v_partner_vendor and i.id = v_item_oak
      returning id into v_po_line;

      insert into public.pr_purchase_request_slip_lines (purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty)
      values (v_pr_line, 'purchase_order', 'DEMO-S2-PO', 'DEMO-S2-PO', 5);
    else
      select id into v_poid from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMO-S2-PO';
      select id into v_po_line from public.po_purchase_order_lines where purchase_order_id = v_poid order by line_no limit 1;
    end if;

    if not exists (select 1 from public.gr_goods_receipts where tenant_id = v_tenant and purchase_order_id = v_poid and status = 'posted') then
      insert into public.gr_goods_receipts (tenant_id, purchase_order_id, receipt_date, location_id, status, notes, created_by_user_id)
      values (v_tenant, v_poid, v_d, v_loc_hq, 'posted', 'GOLDEN-S2 posted GR with 5 serials.', v_user_id)
      returning id into v_grid;

      insert into public.gr_goods_receipt_lines (goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty)
      values (v_grid, v_po_line, 1, 5, 5)
      returning id into v_grline;

      for v_i in 1..5 loop
        v_serial := v_code || '-S2-' || lpad(v_i::text, 3, '0');
        if not exists (select 1 from public.inv_serial_units where tenant_id = v_tenant and serial_no = v_serial) then
          insert into public.inv_serial_units (
            tenant_id, item_id, serial_no, status, location_id,
            purchase_order_line_id, goods_receipt_line_id,
            warranty_start, warranty_end, received_at
          ) values (
            v_tenant, v_item_oak, v_serial, 'in_stock', v_loc_hq,
            v_po_line, v_grline, v_d, (v_d + interval '24 months')::date, now()
          ) returning id into v_serial_id;
          v_unit_ids := array_append(v_unit_ids, v_serial_id);

          insert into public.inv_serial_events (tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id, created_by_user_id)
          values (v_tenant, v_serial_id, 'received', v_loc_hq, 'gr_goods_receipt_line', v_grline, v_user_id);

          insert into public.gr_goods_receipt_serials (goods_receipt_line_id, serial_no)
          values (v_grline, v_serial);
        end if;
      end loop;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values (v_tenant, v_item_oak, v_loc_hq, 5, 'gr_post', 'gr_goods_receipt', v_grid, v_user_id);

      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
      values (v_tenant, v_item_oak, v_loc_hq, 5)
      on conflict (tenant_id, item_id, location_id)
      do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, 5), updated_at = now();
    else
      select gr.id into v_grid from public.gr_goods_receipts gr
      where gr.tenant_id = v_tenant and gr.purchase_order_id = v_poid and gr.status = 'posted' limit 1;
      select array_agg(su.id order by su.serial_no) into v_unit_ids
      from public.inv_serial_units su
      where su.tenant_id = v_tenant and su.serial_no like v_code || '-S2-%';
    end if;

    if not exists (select 1 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S2-SO') then
      insert into public.so_sales_orders (
        tenant_id, order_date, date_seq, sales_order_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        delivery_date, payment_terms, progress_status,
        subtotal, tax_total, grand_total, created_by_user_id
      )
      values (
        v_tenant, v_d, 1, 'DEMO-S2-SO',
        v_tax_vat, v_currency_id, v_partner_sm, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Sales PIC'),
        v_loc_hq, v_d + 5, '30 DAYS', 'in_progress',
        3571.4286, 428.5714, 4000.0000, v_user_id
      ) returning id into v_soid;

      insert into public.so_sales_order_lines (
        sales_order_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_soid, 1, i.id, i.item_code, i.item_name, 'Oak panel serial units for SM kiosk',
        2, 1785.7143, 3571.4286, 428.5714, 2000, 4000
      from public.inv_items i where i.id = v_item_oak
      returning id into v_soline;
    else
      select id into v_soid from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S2-SO';
      select id into v_soline from public.so_sales_order_lines where sales_order_id = v_soid order by line_no limit 1;
    end if;

    if not exists (select 1 from public.so_sales_order_release_lines where sales_order_line_id = v_soline) then
      insert into public.so_sales_order_release_lines (sales_order_line_id, location_id, release_date, release_qty, created_by_user_id)
      values (v_soline, v_loc_hq, v_d, 2, v_user_id)
      returning id into v_release_line;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 2, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_oak and location_id = v_loc_hq;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values (v_tenant, v_item_oak, v_loc_hq, -2, 'so_release', 'so_release_line', v_release_line, v_user_id);

      for v_i in 1..2 loop
        select su.id into v_serial_id
        from public.inv_serial_units su
        where su.tenant_id = v_tenant and su.serial_no = v_code || '-S2-' || lpad(v_i::text, 3, '0')
        limit 1;

        if v_serial_id is not null then
          update public.inv_serial_units
          set status = 'reserved', sales_order_release_line_id = v_release_line, reserved_at = now(), updated_at = now()
          where id = v_serial_id;

          insert into public.inv_serial_events (tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id, created_by_user_id)
          values (v_tenant, v_serial_id, 'reserved', v_loc_hq, 'so_release_line', v_release_line, v_user_id);
        end if;
      end loop;
    else
      select rl.id into v_release_line from public.so_sales_order_release_lines rl
      where rl.sales_order_line_id = v_soline limit 1;
    end if;

    if not exists (select 1 from public.sa_sales where tenant_id = v_tenant and sales_no = 'DEMO-S2-SI') then
      insert into public.sa_sales (
        tenant_id, order_date, date_seq, sales_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        progress_status, template_code, sales_category, source_sales_order_id,
        subtotal, tax_total, grand_total, created_by_user_id
      )
      values (
        v_tenant, v_d, 1, 'DEMO-S2-SI',
        v_tax_vat, v_currency_id, v_partner_sm, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Sales PIC'),
        v_loc_hq, 'completed', 'default', 'general', v_soid,
        3571.4286, 428.5714, 4000.0000, v_user_id
      ) returning id into v_sale_id;

      insert into public.sa_sales_lines (
        sales_id, line_no, item_id, item_code, item_name,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
        serial_lot_no, source_sales_order_line_id
      )
      select v_sale_id, 1, i.id, i.item_code, i.item_name,
        2, 1785.7143, 3571.4286, 428.5714, 2000, 4000,
        v_code || '-S2-001, ' || v_code || '-S2-002', v_soline
      from public.inv_items i where i.id = v_item_oak
      returning id into v_sale_line;

      insert into public.so_sales_order_slip_lines (sales_order_line_id, slip_type, slip_ref, slip_date_no, qty, sales_id)
      values (v_soline, 'sales', 'DEMO-S2-SI', 'DEMO-S2-SI', 2, v_sale_id);

      update public.so_sales_orders set fulfillment_status = 'completed', updated_at = now() where id = v_soid;

      for v_i in 1..2 loop
        select su.id into v_serial_id
        from public.inv_serial_units su
        where su.tenant_id = v_tenant and su.serial_no = v_code || '-S2-' || lpad(v_i::text, 3, '0')
        limit 1;

        if v_serial_id is not null then
          update public.inv_serial_units
          set status = 'sold', partner_id = v_partner_sm, sales_line_id = v_sale_line, updated_at = now()
          where id = v_serial_id;

          insert into public.inv_serial_unit_sales_lines (sales_line_id, serial_unit_id)
          values (v_sale_line, v_serial_id) on conflict do nothing;

          insert into public.inv_serial_events (tenant_id, serial_unit_id, event_type, ref_type, ref_id, created_by_user_id)
          values (v_tenant, v_serial_id, 'sold', 'sa_sales_line', v_sale_line, v_user_id);
        end if;
      end loop;
    end if;

    -- === S3: lot chain ===
    if v_item_fabric is not null then
      update public.inv_items
      set track_lot = true, track_serial = false, track_inventory_qty = true
      where id = v_item_fabric;

      if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S3-PR') then
        insert into public.pr_purchase_requests (
          tenant_id, request_date, date_seq, purchase_request_no,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          progress_status, subtotal, tax_total, grand_total, created_by_user_id, notes
        )
        values (
          v_tenant, v_d, 2, 'DEMO-S3-PR', v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
          coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
          v_loc_hq, 'confirmed', 44642.8571, 5357.1429, 50000.0000, v_user_id,
          'GOLDEN-S3 fabric lot purchase.'
        ) returning id into v_prid3;

        insert into public.pr_purchase_request_lines (
          purchase_request_id, line_no, partner_id, partner_code, partner_name,
          item_id, item_code, item_name, qty,
          unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
        )
        select v_prid3, 1, v_partner_vendor, p.partner_code, p.company_name,
          v_item_fabric, i.item_code, i.item_name, 50,
          892.8571, 44642.8571, 5357.1429, 1000, 50000, 'vat_inc_unit'
        from public.inv_partners p, public.inv_items i
        where p.id = v_partner_vendor and i.id = v_item_fabric
        returning id into v_pr_line3;
      else
        select id into v_prid3 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S3-PR';
        select id into v_pr_line3 from public.pr_purchase_request_lines where purchase_request_id = v_prid3 limit 1;
      end if;

      if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMO-S3-PO') then
        insert into public.po_purchase_orders (
          tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
          tax_type_id, currency_id, partner_id, location_id, status,
          subtotal, tax_total, grand_total, created_by_user_id, notes
        )
        values (
          v_tenant, v_d, 1, 'DEMO-S3-PO', v_prid3, v_tax_vat, v_currency_id, v_partner_vendor, v_loc_hq, 'received',
          44642.8571, 5357.1429, 50000.0000, v_user_id, 'GOLDEN-S3 lot PO.'
        ) returning id into v_poid3;

        insert into public.po_purchase_order_lines (
          purchase_order_id, purchase_request_line_id, line_no,
          partner_id, partner_code, partner_name,
          item_id, item_code, item_name, qty, received_qty,
          unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
        )
        select v_poid3, v_pr_line3, 1, v_partner_vendor, p.partner_code, p.company_name,
          v_item_fabric, i.item_code, i.item_name, 50, 50,
          892.8571, 44642.8571, 5357.1429, 1000, 50000, 'vat_inc_unit'
        from public.inv_partners p, public.inv_items i
        where p.id = v_partner_vendor and i.id = v_item_fabric
        returning id into v_po_line3;
      else
        select id into v_poid3 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMO-S3-PO';
        select id into v_po_line3 from public.po_purchase_order_lines where purchase_order_id = v_poid3 limit 1;
      end if;

      if not exists (select 1 from public.gr_goods_receipts where tenant_id = v_tenant and purchase_order_id = v_poid3 and status = 'posted') then
        insert into public.gr_goods_receipts (tenant_id, purchase_order_id, receipt_date, location_id, status, notes, created_by_user_id)
        values (v_tenant, v_poid3, v_d, v_loc_hq, 'posted', 'GOLDEN-S3 lot GR.', v_user_id)
        returning id into v_grid3;

        insert into public.gr_goods_receipt_lines (goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty)
        values (v_grid3, v_po_line3, 1, 50, 50)
        returning id into v_grline3;

        insert into public.gr_goods_receipt_line_lots (goods_receipt_line_id, lot_no, qty)
        values (v_grline3, 'LOT-S3-A', 50);

        insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, purchase_order_line_id, goods_receipt_line_id)
        values (v_tenant, v_item_fabric, 'LOT-S3-A', v_loc_hq, 50, v_po_line3, v_grline3)
        on conflict (tenant_id, item_id, lot_no, location_id)
        do update set qty_on_hand = 50, updated_at = now()
        returning id into v_lot_batch;

        insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
        values (v_tenant, v_item_fabric, v_loc_hq, 50, 'gr_post', 'gr_goods_receipt', v_grid3, v_user_id);

        insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
        values (v_tenant, v_item_fabric, v_loc_hq, 50)
        on conflict (tenant_id, item_id, location_id)
        do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, 50), updated_at = now();
      else
        select lb.id into v_lot_batch from public.inv_lot_batches lb
        where lb.tenant_id = v_tenant and lb.lot_no = 'LOT-S3-A' and lb.item_id = v_item_fabric limit 1;
      end if;

      if v_lot_batch is not null and not exists (select 1 from public.sa_sales where tenant_id = v_tenant and sales_no = 'DEMO-S3-SI') then
        insert into public.sa_sales (
          tenant_id, order_date, date_seq, sales_no,
          tax_type_id, currency_id, partner_id, pic_user_id, location_id,
          progress_status, template_code, subtotal, tax_total, grand_total, created_by_user_id
        )
        values (
          v_tenant, v_d, 2, 'DEMO-S3-SI', v_tax_vat, v_currency_id, v_partner_sm, v_user_id, v_loc_hq,
          'completed', 'default', 8928.5714, 1071.4286, 10000.0000, v_user_id
        ) returning id into v_sale_id;

        insert into public.sa_sales_lines (
          sales_id, line_no, item_id, item_code, item_name,
          qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
          serial_lot_no, lot_batch_id
        )
        select v_sale_id, 1, i.id, i.item_code, i.item_name,
          10, 892.8571, 8928.5714, 1071.4286, 1000, 10000,
          'LOT-S3-A', v_lot_batch
        from public.inv_items i where i.id = v_item_fabric;

        update public.inv_lot_batches set qty_on_hand = qty_on_hand - 10, updated_at = now() where id = v_lot_batch;
        update public.inv_item_location_balances set qty_on_hand = qty_on_hand - 10, updated_at = now()
        where tenant_id = v_tenant and item_id = v_item_fabric and location_id = v_loc_hq;
      end if;
    end if;

    -- === S4: direct sale (skip SO) ===
    if v_item_foam is not null and not exists (select 1 from public.sa_sales where tenant_id = v_tenant and sales_no = 'DEMO-S4-SI') then
      update public.inv_items set track_inventory_qty = true where id = v_item_foam;

      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
      values (v_tenant, v_item_foam, v_loc_hq, 3)
      on conflict (tenant_id, item_id, location_id)
      do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, 3), updated_at = now();

      insert into public.sa_sales (
        tenant_id, order_date, date_seq, sales_no,
        tax_type_id, currency_id, partner_id, pic_user_id, location_id,
        progress_status, template_code, subtotal, tax_total, grand_total, created_by_user_id, notes
      )
      values (
        v_tenant, v_d, 3, 'DEMO-S4-SI', v_tax_vat, v_currency_id, v_partner_sm, v_user_id, v_loc_hq,
        'completed', 'default', 982.1429, 117.8571, 1100.0000, v_user_id,
        'GOLDEN-S4 direct sale (no sales order).'
      ) returning id into v_sale_id;

      insert into public.sa_sales_lines (
        sales_id, line_no, item_id, item_code, item_name,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_sale_id, 1, i.id, i.item_code, i.item_name,
        1, 982.1429, 982.1429, 117.8571, 1100, 1100
      from public.inv_items i where i.id = v_item_foam;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 1, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_foam and location_id = v_loc_hq;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      select v_tenant, v_item_foam, v_loc_hq, -1, 'sales', 'sa_sales_line', ln.id, v_user_id
      from public.sa_sales_lines ln where ln.sales_id = v_sale_id limit 1;
    end if;

    -- === S9: SO → reserve → DR → SI (split-mode ledger demo) ===
    if v_item_foam is not null then
      update public.inv_items set track_inventory_qty = true where id = v_item_foam;

      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand, qty_reserved)
      values (v_tenant, v_item_foam, v_loc_hq, 10, 0)
      on conflict (tenant_id, item_id, location_id)
      do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, 10),
                    qty_reserved = coalesce(inv_item_location_balances.qty_reserved, 0),
                    updated_at = now();

      if not exists (select 1 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S9-SO') then
        insert into public.so_sales_orders (
          tenant_id, order_date, date_seq, sales_order_no,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          delivery_date, payment_terms, progress_status,
          subtotal, tax_total, grand_total, created_by_user_id, notes
        )
        values (
          v_tenant, v_d, 9, 'DEMO-S9-SO',
          v_tax_vat, v_currency_id, v_partner_sm, v_user_id,
          coalesce((select full_name from public.users where id = v_user_id), 'Sales PIC'),
          v_loc_hq, v_d + 3, '30 DAYS', 'in_progress',
          1964.2857, 235.7143, 2200.0000, v_user_id,
          'GOLDEN-S9 reserve → DR → SI chain.'
        ) returning id into v_soid9;

        insert into public.so_sales_order_lines (
          sales_order_id, line_no, item_id, item_code, item_name, description,
          qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
        )
        select v_soid9, 1, i.id, i.item_code, i.item_name, 'Foam blocks for S9 DR chain',
          2, 982.1429, 1964.2857, 235.7143, 1100, 2200
        from public.inv_items i where i.id = v_item_foam
        returning id into v_soline9;
      else
        select id into v_soid9 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S9-SO';
        select id into v_soline9 from public.so_sales_order_lines where sales_order_id = v_soid9 order by line_no limit 1;
      end if;

      if not exists (select 1 from public.so_sales_order_release_lines where sales_order_line_id = v_soline9) then
        insert into public.so_sales_order_release_lines (sales_order_line_id, location_id, release_date, release_qty, created_by_user_id)
        values (v_soline9, v_loc_hq, v_d, 2, v_user_id)
        returning id into v_release_line9;

        update public.inv_item_location_balances
        set qty_reserved = qty_reserved + 2, updated_at = now()
        where tenant_id = v_tenant and item_id = v_item_foam and location_id = v_loc_hq;

        insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
        values (v_tenant, v_item_foam, v_loc_hq, 0, 'so_reserve', 'so_release_line', v_release_line9, v_user_id);
      else
        select rl.id into v_release_line9 from public.so_sales_order_release_lines rl
        where rl.sales_order_line_id = v_soline9 limit 1;
      end if;

      if not exists (select 1 from public.dr_delivery_receipts where tenant_id = v_tenant and delivery_no = 'DEMO-S9-DR') then
        insert into public.dr_delivery_receipts (
          tenant_id, delivery_date, date_seq, delivery_no, sales_order_id,
          partner_id, location_id, status, notes, created_by_user_id, posted_at
        )
        values (
          v_tenant, v_d, 9, 'DEMO-S9-DR', v_soid9,
          v_partner_sm, v_loc_hq, 'posted', 'GOLDEN-S9 posted delivery receipt.', v_user_id, now()
        ) returning id into v_drid;

        insert into public.dr_delivery_receipt_lines (
          delivery_receipt_id, sales_order_line_id, sales_order_release_line_id,
          line_no, item_id, item_code, item_name, qty
        )
        select v_drid, v_soline9, v_release_line9, 1, i.id, i.item_code, i.item_name, 2
        from public.inv_items i where i.id = v_item_foam;

        insert into public.so_sales_order_slip_lines (sales_order_line_id, slip_type, slip_ref, slip_date_no, qty)
        values (v_soline9, 'delivery_receipt', 'DEMO-S9-DR', 'DEMO-S9-DR', 2);

        update public.inv_item_location_balances
        set qty_on_hand = qty_on_hand - 2, qty_reserved = qty_reserved - 2, updated_at = now()
        where tenant_id = v_tenant and item_id = v_item_foam and location_id = v_loc_hq;

        insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
        select v_tenant, v_item_foam, v_loc_hq, -2, 'dr_issue', 'dr_delivery_receipt_line', drl.id, v_user_id
        from public.dr_delivery_receipt_lines drl where drl.delivery_receipt_id = v_drid limit 1;
      end if;

      if not exists (select 1 from public.sa_sales where tenant_id = v_tenant and sales_no = 'DEMO-S9-SI') then
        insert into public.sa_sales (
          tenant_id, order_date, date_seq, sales_no,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          progress_status, template_code, sales_category, source_sales_order_id,
          subtotal, tax_total, grand_total, created_by_user_id, notes
        )
        values (
          v_tenant, v_d, 9, 'DEMO-S9-SI',
          v_tax_vat, v_currency_id, v_partner_sm, v_user_id,
          coalesce((select full_name from public.users where id = v_user_id), 'Sales PIC'),
          v_loc_hq, 'completed', 'default', 'general', v_soid9,
          1964.2857, 235.7143, 2200.0000, v_user_id,
          'GOLDEN-S9 sales invoice after delivery receipt.'
        ) returning id into v_sale_id;

        insert into public.sa_sales_lines (
          sales_id, line_no, item_id, item_code, item_name,
          qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
          source_sales_order_line_id
        )
        select v_sale_id, 1, i.id, i.item_code, i.item_name,
          2, 982.1429, 1964.2857, 235.7143, 1100, 2200, v_soline9
        from public.inv_items i where i.id = v_item_foam;

        insert into public.so_sales_order_slip_lines (sales_order_line_id, slip_type, slip_ref, slip_date_no, qty, sales_id)
        values (v_soline9, 'sales', 'DEMO-S9-SI', 'DEMO-S9-SI', 2, v_sale_id);

        update public.so_sales_orders set fulfillment_status = 'completed', updated_at = now() where id = v_soid9;
      end if;
    end if;

    -- === S10: PR approval light (pending + approved → PO) ===
    if v_item_foam is not null then
      if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S10-PR') then
        insert into public.pr_purchase_requests (
          tenant_id, request_date, date_seq, purchase_request_no,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          domestic_foreign, send_status, progress_status,
          total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id
        )
        values (
          v_tenant, v_d, 10, 'DEMO-S10-PR', v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
          coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
          v_loc_hq, 'domestic', 'sent', 'e_approval',
          3, 'GOLDEN-S10 pending internal PR approval.',
          2946.4286, 353.5714, 3300.0000, v_user_id
        ) returning id into v_prid;

        insert into public.pr_purchase_request_lines (
          purchase_request_id, line_no, partner_id, partner_code, partner_name,
          item_id, item_code, item_name, qty,
          unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
        )
        select v_prid, 1, v_partner_vendor, p.partner_code, p.company_name,
          v_item_foam, i.item_code, i.item_name, 3,
          982.1429, 2946.4286, 353.5714, 1100, 3300, 'vat_inc_unit'
        from public.inv_partners p, public.inv_items i
        where p.id = v_partner_vendor and i.id = v_item_foam;

        insert into public.pr_approvals (
          purchase_request_id, action, actor_user_id, actor_name, remarks, from_status, to_status
        )
        values (
          v_prid, 'submit', v_user_id,
          coalesce((select full_name from public.users where id = v_user_id), 'Demo User'),
          'Submitted for demo approval queue.', 'unconfirmed', 'e_approval'
        );
      end if;

      if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S10-PR-OK') then
        insert into public.pr_purchase_requests (
          tenant_id, request_date, date_seq, purchase_request_no,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          domestic_foreign, send_status, progress_status,
          approved_at, approved_by_user_id,
          total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id
        )
        values (
          v_tenant, v_d, 11, 'DEMO-S10-PR-OK', v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
          coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
          v_loc_hq, 'domestic', 'sent', 'confirmed',
          now(), v_user_id,
          2, 'GOLDEN-S10 approved PR with linked PO.',
          1964.2857, 235.7143, 2200.0000, v_user_id
        ) returning id into v_prid3;

        insert into public.pr_purchase_request_lines (
          purchase_request_id, line_no, partner_id, partner_code, partner_name,
          item_id, item_code, item_name, qty,
          unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
        )
        select v_prid3, 1, v_partner_vendor, p.partner_code, p.company_name,
          v_item_foam, i.item_code, i.item_name, 2,
          982.1429, 1964.2857, 235.7143, 1100, 2200, 'vat_inc_unit'
        from public.inv_partners p, public.inv_items i
        where p.id = v_partner_vendor and i.id = v_item_foam
        returning id into v_pr_line3;

        insert into public.pr_approvals (
          purchase_request_id, action, actor_user_id, actor_name, remarks, from_status, to_status
        )
        values
          (v_prid3, 'submit', v_user_id, coalesce((select full_name from public.users where id = v_user_id), 'Demo User'), null, 'unconfirmed', 'e_approval'),
          (v_prid3, 'approve', v_user_id, coalesce((select full_name from public.users where id = v_user_id), 'Demo User'), 'Demo approval.', 'e_approval', 'confirmed');

        insert into public.po_purchase_orders (
          tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
          tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
          status, notes, subtotal, tax_total, grand_total, created_by_user_id
        )
        values (
          v_tenant, v_d, 10, 'DEMO-S10-PO', v_prid3, v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
          coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
          v_loc_hq, 'draft', 'GOLDEN-S10 PO from approved PR.',
          1964.2857, 235.7143, 2200.0000, v_user_id
        ) returning id into v_poid3;

        insert into public.po_purchase_order_lines (
          purchase_order_id, purchase_request_line_id, line_no,
          partner_id, partner_code, partner_name,
          item_id, item_code, item_name, qty, received_qty,
          unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
        )
        select v_poid3, v_pr_line3, 1, v_partner_vendor, p.partner_code, p.company_name,
          v_item_foam, i.item_code, i.item_name, 2, 0,
          982.1429, 1964.2857, 235.7143, 1100, 2200, 'vat_inc_unit'
        from public.inv_partners p, public.inv_items i
        where p.id = v_partner_vendor and i.id = v_item_foam;

        insert into public.pr_purchase_request_slip_lines (purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty)
        values (v_pr_line3, 'purchase_order', 'DEMO-S10-PO', 'DEMO-S10-PO', 2);
      end if;
    end if;

    -- === S11: standalone PO (no purchase request) ===
    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMO-S11-PO') then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        status, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      values (
        v_tenant, v_d, 11, 'DEMO-S11-PO', null,
        v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
        v_loc_hq, 'confirmed', 'GOLDEN-S11 standalone PO without PR.',
        982.1429, 117.8571, 1100.0000, v_user_id
      ) returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_poid, null, 1, v_partner_vendor, p.partner_code, p.company_name,
        coalesce(v_item_foam, v_item_oak), i.item_code, i.item_name, 1, 0,
        982.1429, 982.1429, 117.8571, 1100, 1100, 'vat_inc_unit'
      from public.inv_partners p
      join public.inv_items i on i.id = coalesce(v_item_foam, v_item_oak)
      where p.id = v_partner_vendor;
    end if;

    raise notice 'seed-demo-golden-scenarios: ensured S2/S3/S4/S9/S10/S11 for %', v_code;
  end loop;
end $$;

commit;
