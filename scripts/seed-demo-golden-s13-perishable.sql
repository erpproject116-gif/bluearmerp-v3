-- Golden scenario S13: perishable catch-weight lots with FEFO sale
-- Run after seed-demo-golden-scenarios.sql (uses same tenant loop pattern)
-- Idempotent: DEMO-S13-* document numbers

begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_d date := date '2025-06-15';
  v_user_id bigint;
  v_loc_hq bigint;
  v_partner_vendor bigint;
  v_partner_sm bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_item_perish bigint;
  v_prid bigint;
  v_pr_line bigint;
  v_poid bigint;
  v_po_line bigint;
  v_grid bigint;
  v_grline bigint;
  v_lot_old bigint;
  v_lot_new bigint;
  v_sale_id bigint;
  v_sale_line bigint;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_loc_hq from public.inv_locations where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_partner_vendor from public.inv_partners where tenant_id = v_tenant and partner_code = '00004' limit 1;
    select id into v_partner_sm from public.inv_partners where tenant_id = v_tenant and partner_code = '00001' limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and deleted_at is null
    order by case when name = 'Vat Included' then 0 else 1 end, sort_order limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_item_perish from public.inv_items where tenant_id = v_tenant and item_code = '00004' limit 1;

    if v_user_id is null or v_tax_vat is null or v_currency_id is null or v_loc_hq is null
       or v_partner_vendor is null or v_partner_sm is null or v_item_perish is null then
      raise warning 'seed-demo-golden-s13: missing master data for % — skip', v_code;
      continue;
    end if;

    update public.inv_items
    set track_lot = true, track_serial = false, track_inventory_qty = true,
        catch_weight = true, lot_allocation_method = 'fefo',
        default_shelf_life_days = 7, price_basis = 'per_kg',
        base_unit_id = coalesce(
          base_unit_id,
          (select u.id from public.inv_units u where u.tenant_id = v_tenant order by u.id limit 1)
        )
    where id = v_item_perish;

    if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S13-PR') then
      insert into public.pr_purchase_requests (
        tenant_id, request_date, date_seq, purchase_request_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        domestic_foreign, send_status, progress_status,
        total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      values (
        v_tenant, v_d, 13, 'DEMO-S13-PR', v_tax_vat, v_currency_id, v_partner_vendor, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Procurement'),
        v_loc_hq, 'domestic', 'sent', 'confirmed',
        69, 'GOLDEN-S13 perishable pork belly (catch-weight).',
        53571.4286, 6428.5714, 60000.0000, v_user_id
      ) returning id into v_prid;

      insert into public.pr_purchase_request_lines (
        purchase_request_id, line_no, partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_prid, 1, v_partner_vendor, p.partner_code, p.company_name,
        v_item_perish, i.item_code, i.item_name, 69,
        776.1194, 53571.4286, 6428.5714, 869.5652, 60000, 'vat_inc_unit'
      from public.inv_partners p, public.inv_items i
      where p.id = v_partner_vendor and i.id = v_item_perish
      returning id into v_pr_line;
    else
      select id into v_prid from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = 'DEMO-S13-PR';
      select id into v_pr_line from public.pr_purchase_request_lines where purchase_request_id = v_prid limit 1;
    end if;

    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMO-S13-PO') then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, location_id, status,
        subtotal, tax_total, grand_total, created_by_user_id, notes
      )
      values (
        v_tenant, v_d, 13, 'DEMO-S13-PO', v_prid, v_tax_vat, v_currency_id, v_partner_vendor, v_loc_hq, 'received',
        53571.4286, 6428.5714, 60000.0000, v_user_id, 'GOLDEN-S13 perishable PO.'
      ) returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty, received_qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_poid, v_pr_line, 1, v_partner_vendor, p.partner_code, p.company_name,
        v_item_perish, i.item_code, i.item_name, 69, 69,
        776.1194, 53571.4286, 6428.5714, 869.5652, 60000, 'vat_inc_unit'
      from public.inv_partners p, public.inv_items i
      where p.id = v_partner_vendor and i.id = v_item_perish
      returning id into v_po_line;
    else
      select id into v_poid from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = 'DEMO-S13-PO';
      select id into v_po_line from public.po_purchase_order_lines where purchase_order_id = v_poid limit 1;
    end if;

    if not exists (select 1 from public.gr_goods_receipts where tenant_id = v_tenant and purchase_order_id = v_poid and status = 'posted') then
      insert into public.gr_goods_receipts (tenant_id, purchase_order_id, receipt_date, location_id, status, notes, created_by_user_id)
      values (v_tenant, v_poid, v_d, v_loc_hq, 'posted', 'GOLDEN-S13 catch-weight GR.', v_user_id)
      returning id into v_grid;

      insert into public.gr_goods_receipt_lines (goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty)
      values (v_grid, v_po_line, 1, 69, 69)
      returning id into v_grline;

      insert into public.gr_goods_receipt_line_lots (goods_receipt_line_id, lot_no, qty, expiry_date)
      values (v_grline, 'LOT-S13-A', 35.2, v_d + 3);

      insert into public.gr_goods_receipt_line_lots (goods_receipt_line_id, lot_no, qty, expiry_date)
      values (v_grline, 'LOT-S13-B', 33.8, v_d + 10);

      insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date, purchase_order_line_id, goods_receipt_line_id)
      values (v_tenant, v_item_perish, 'LOT-S13-A', v_loc_hq, 35.2, v_d + 3, v_po_line, v_grline)
      on conflict (tenant_id, item_id, lot_no, location_id)
      do update set qty_on_hand = 35.2, expiry_date = excluded.expiry_date, updated_at = now()
      returning id into v_lot_old;

      insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date, purchase_order_line_id, goods_receipt_line_id)
      values (v_tenant, v_item_perish, 'LOT-S13-B', v_loc_hq, 33.8, v_d + 10, v_po_line, v_grline)
      on conflict (tenant_id, item_id, lot_no, location_id)
      do update set qty_on_hand = 33.8, expiry_date = excluded.expiry_date, updated_at = now()
      returning id into v_lot_new;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values (v_tenant, v_item_perish, v_loc_hq, 69, 'gr_post', 'gr_goods_receipt', v_grid, v_user_id);

      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
      values (v_tenant, v_item_perish, v_loc_hq, 69)
      on conflict (tenant_id, item_id, location_id)
      do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, 69), updated_at = now();
    else
      select lb.id into v_lot_old from public.inv_lot_batches lb
      where lb.tenant_id = v_tenant and lb.lot_no = 'LOT-S13-A' and lb.item_id = v_item_perish limit 1;
      select lb.id into v_lot_new from public.inv_lot_batches lb
      where lb.tenant_id = v_tenant and lb.lot_no = 'LOT-S13-B' and lb.item_id = v_item_perish limit 1;
    end if;

    if v_lot_old is not null and not exists (select 1 from public.sa_sales where tenant_id = v_tenant and sales_no = 'DEMO-S13-SI') then
      insert into public.sa_sales (
        tenant_id, order_date, date_seq, sales_no,
        tax_type_id, currency_id, partner_id, pic_user_id, location_id,
        progress_status, template_code, subtotal, tax_total, grand_total, created_by_user_id
      )
      values (
        v_tenant, v_d, 13, 'DEMO-S13-SI', v_tax_vat, v_currency_id, v_partner_sm, v_user_id, v_loc_hq,
        'completed', 'default', 34782.6087, 4173.9130, 38956.5217, v_user_id
      ) returning id into v_sale_id;

      insert into public.sa_sales_lines (
        sales_id, line_no, item_id, item_code, item_name,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
        serial_lot_no, lot_batch_id
      )
      select v_sale_id, 1, i.id, i.item_code, i.item_name,
        40, 776.1194, 31044.7760, 3725.3731, 869.5652, 34782.6087,
        'LOT-S13-A', v_lot_old
      from public.inv_items i where i.id = v_item_perish
      returning id into v_sale_line;

      insert into public.sa_sales_line_lot_allocations (sales_line_id, lot_batch_id, qty)
      values (v_sale_line, v_lot_old, 35.2), (v_sale_line, v_lot_new, 4.8);

      update public.inv_lot_batches set qty_on_hand = 0, updated_at = now()
      where id = v_lot_old and tenant_id = v_tenant;

      update public.inv_lot_batches set qty_on_hand = 29.0, updated_at = now()
      where id = v_lot_new and tenant_id = v_tenant;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 40, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_perish and location_id = v_loc_hq;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values (v_tenant, v_item_perish, v_loc_hq, -40, 'sales', 'sa_sales_line', v_sale_line, v_user_id);
    end if;

    raise notice 'seed-demo-golden-s13: ensured S13 perishable chain for %', v_code;
  end loop;
end $$;

commit;
