-- Demo serial/lot chain: track_serial items, PO from PR, goods receipt with serial units
-- Run after: migrations 040-044, seed-demo-purchase-requests.sql, seed-demo-inventory.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_loc_hq bigint;
  v_prid bigint;
  v_pr_line bigint;
  v_poid bigint;
  v_po_line bigint;
  v_grid bigint;
  v_grline bigint;
  v_item bigint;
  v_d date;
  v_po_no text;
  v_serial text;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_tax_vat from public.quo_tax_types where tenant_id = v_tenant and name = 'Vat Included' and deleted_at is null limit 1;
    select id into v_currency_id from public.quo_currencies where tenant_id = v_tenant and is_default = true limit 1;
    select id into v_loc_hq from public.inv_locations where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_item from public.inv_items where tenant_id = v_tenant and item_code = '00002' limit 1;

    if v_item is null or v_loc_hq is null then continue; end if;

    update public.inv_items
    set track_serial = true, track_inventory_qty = true, warranty_duration_months = 24
    where id = v_item;

    v_d := current_date;
    v_po_no := to_char(v_d, 'YYMMDD') || '901';

    select pr.id into v_prid
    from public.pr_purchase_requests pr
    where pr.tenant_id = v_tenant and pr.purchase_request_no = to_char(v_d, 'YYMMDD') || '202'
    limit 1;

    if v_prid is null then continue; end if;

    if not exists (select 1 from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = v_po_no) then
      insert into public.po_purchase_orders (
        tenant_id, order_date, date_seq, purchase_order_no, purchase_request_id,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        status, subtotal, tax_total, grand_total, created_by_user_id
      )
      select v_tenant, v_d, 1, v_po_no, v_prid,
        v_tax_vat, v_currency_id, pr.partner_id, pr.pic_user_id, pr.pic_name, pr.location_id,
        'confirmed', pr.subtotal, pr.tax_total, pr.grand_total, v_user_id
      from public.pr_purchase_requests pr where pr.id = v_prid
      returning id into v_poid;

      insert into public.po_purchase_order_lines (
        purchase_order_id, purchase_request_line_id, line_no,
        partner_id, partner_code, partner_name,
        item_id, item_code, item_name, qty,
        unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_poid, ln.id, ln.line_no,
        ln.partner_id, ln.partner_code, ln.partner_name,
        ln.item_id, ln.item_code, ln.item_name, ln.qty,
        ln.unit_non_vat, ln.non_vat_total, ln.tax_amount, ln.unit_vat_inc, ln.line_total, ln.input_basis
      from public.pr_purchase_request_lines ln
      where ln.purchase_request_id = v_prid
      returning id into v_po_line;

      insert into public.pr_purchase_request_slip_lines (purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty)
      select ln.id, 'purchase_order', v_po_no, v_po_no, ln.qty
      from public.pr_purchase_request_lines ln where ln.purchase_request_id = v_prid;
    else
      select id into v_poid from public.po_purchase_orders where tenant_id = v_tenant and purchase_order_no = v_po_no;
      select id into v_po_line from public.po_purchase_order_lines where purchase_order_id = v_poid limit 1;
    end if;

    if not exists (select 1 from public.gr_goods_receipts where tenant_id = v_tenant and purchase_order_id = v_poid) then
      insert into public.gr_goods_receipts (tenant_id, purchase_order_id, receipt_date, location_id, status, created_by_user_id)
      values (v_tenant, v_poid, v_d, v_loc_hq, 'posted', v_user_id)
      returning id into v_grid;

      insert into public.gr_goods_receipt_lines (goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty)
      select v_grid, pol.id, pol.line_no, pol.qty, pol.qty
      from public.po_purchase_order_lines pol where pol.purchase_order_id = v_poid
      returning id into v_grline;

      for i in 1..2 loop
        v_serial := upper(v_code) || '-SN-' || to_char(v_d, 'YYMMDD') || '-' || lpad(i::text, 3, '0');
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

      update public.po_purchase_order_lines set received_qty = qty where purchase_order_id = v_poid;
      update public.po_purchase_orders set status = 'received' where id = v_poid;

      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
      values (v_tenant, v_item, v_loc_hq, 2)
      on conflict (tenant_id, item_id, location_id)
      do update set qty_on_hand = 2, updated_at = now();
    end if;
  end loop;
end $$;

commit;
