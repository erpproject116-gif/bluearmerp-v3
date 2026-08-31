-- Golden scenario S17: meat cut (disassembly + catch-weight + pack + FEFO sale)
-- Run after S14–S16 seeds (same tenant loop). Idempotent: DEMO-S17-* docs.
-- inv_partners.partner_code and inv_items.item_code are char(5) — use M17A/M17B and S17WH/S17BL/S17PT/S17RB.
-- MVP: cut lots are seeded (does not require Go-Live cut-lot complete API).

begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_d date := date '2025-06-15';
  v_user_id bigint;
  v_loc_plant bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_cust_a bigint;
  v_cust_b bigint;
  v_whole bigint;
  v_belly bigint;
  v_pata bigint;
  v_ribs bigint;
  v_bom bigint;
  v_lot_whole bigint;
  v_lot_belly_old bigint;
  v_lot_belly_new bigint;
  v_lot_pata bigint;
  v_lot_ribs bigint;
  v_so_a bigint;
  v_so_a_line bigint;
  v_so_b bigint;
  v_wo bigint;
  v_pack bigint;
  v_ship bigint;
  v_sale_id bigint;
  v_sale_line bigint;
  v_has_bom_type boolean;
  v_has_pack boolean;
  v_has_ship boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mfg_boms' and column_name = 'bom_type'
  ) into v_has_bom_type;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'inv_pack_sessions'
  ) into v_has_pack;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sh_shipping_orders'
  ) into v_has_ship;

  if not v_has_bom_type then
    raise exception 'seed-demo-golden-s17: apply api/migrations/270_mfg_disassembly_phase3.sql (bom_type) before running';
  end if;

  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_loc_plant from public.inv_locations where tenant_id = v_tenant and location_code = '00002' limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and deleted_at is null
    order by case when name = 'Vat Included' then 0 else 1 end, sort_order limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;

    if v_user_id is null or v_loc_plant is null or v_tax_vat is null or v_currency_id is null then
      raise warning 'seed-demo-golden-s17: missing master data for % — skip', v_code;
      continue;
    end if;

    -- Customers (partner_code char(5))
    insert into public.inv_partners (tenant_id, partner_code, company_name, partner_kind, status)
    values (v_tenant, 'M17A', 'Meat Customer A', 'customer', 'active')
    on conflict (tenant_id, partner_code) do update
      set company_name = excluded.company_name, partner_kind = 'customer', status = 'active', updated_at = now()
    returning id into v_cust_a;
    if v_cust_a is null then
      select id into v_cust_a from public.inv_partners where tenant_id = v_tenant and partner_code = 'M17A';
    end if;

    insert into public.inv_partners (tenant_id, partner_code, company_name, partner_kind, status)
    values (v_tenant, 'M17B', 'Meat Customer B', 'customer', 'active')
    on conflict (tenant_id, partner_code) do update
      set company_name = excluded.company_name, partner_kind = 'customer', status = 'active', updated_at = now()
    returning id into v_cust_b;
    if v_cust_b is null then
      select id into v_cust_b from public.inv_partners where tenant_id = v_tenant and partner_code = 'M17B';
    end if;

    -- Items: whole + cuts (item_code char(5); lot + catch-weight + FEFO)
    insert into public.inv_items (
      tenant_id, item_code, item_name, purchase_price, sales_price, vip_price, status,
      track_inventory_qty, track_lot, track_serial, catch_weight, lot_allocation_method,
      default_shelf_life_days, price_basis
    ) values
      (v_tenant, 'S17WH', 'Whole pork (primal)', 180.00, 0, 0, 'active', true, true, false, true, 'fefo', 5, 'per_kg'),
      (v_tenant, 'S17BL', 'Pork belly cut', 0, 320.00, 300.00, 'active', true, true, false, true, 'fefo', 5, 'per_kg'),
      (v_tenant, 'S17PT', 'Pork pata cut', 0, 280.00, 260.00, 'active', true, true, false, true, 'fefo', 5, 'per_kg'),
      (v_tenant, 'S17RB', 'Pork ribs cut', 0, 300.00, 280.00, 'active', true, true, false, true, 'fefo', 5, 'per_kg')
    on conflict (tenant_id, item_code) do update set
      item_name = excluded.item_name,
      track_inventory_qty = true, track_lot = true, track_serial = false,
      catch_weight = true, lot_allocation_method = 'fefo',
      default_shelf_life_days = 5, price_basis = 'per_kg',
      status = 'active', updated_at = now();

    select id into v_whole from public.inv_items where tenant_id = v_tenant and item_code = 'S17WH';
    select id into v_belly from public.inv_items where tenant_id = v_tenant and item_code = 'S17BL';
    select id into v_pata from public.inv_items where tenant_id = v_tenant and item_code = 'S17PT';
    select id into v_ribs from public.inv_items where tenant_id = v_tenant and item_code = 'S17RB';

    -- Disassembly recipe: 1 whole (80 kg basis) → expected cut yields
    if not exists (select 1 from public.mfg_boms where tenant_id = v_tenant and bom_code = 'DEMO-S17-BOM') then
      insert into public.mfg_boms (
        tenant_id, bom_code, bom_name, finished_item_id, default_location_id,
        output_qty, yield_pct, bom_type, expected_yield_pct_min, expected_yield_pct_max,
        is_active, notes
      ) values (
        v_tenant, 'DEMO-S17-BOM', 'Whole pork — cut apart yields', v_whole, v_loc_plant,
        80, 100, 'disassembly', 90, 100, true,
        'GOLDEN-S17 meat disassembly: S17WH → S17BL/S17PT/S17RB (kg). Costing not allocated on complete.'
      ) returning id into v_bom;

      insert into public.mfg_bom_lines (bom_id, line_no, component_item_id, qty, scrap_qty)
      values
        (v_bom, 1, v_belly, 28, 0),
        (v_bom, 2, v_pata, 22, 0),
        (v_bom, 3, v_ribs, 18, 0);
    else
      select id into v_bom from public.mfg_boms where tenant_id = v_tenant and bom_code = 'DEMO-S17-BOM';
    end if;

    -- Opening whole carcass lot at plant
    insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date)
    values (v_tenant, v_whole, 'LOT-S17-WHOLE-1', v_loc_plant, 80, v_d + 4)
    on conflict (tenant_id, item_id, lot_no, location_id)
    do update set qty_on_hand = greatest(inv_lot_batches.qty_on_hand, 80), expiry_date = excluded.expiry_date, updated_at = now()
    returning id into v_lot_whole;
    if v_lot_whole is null then
      select id into v_lot_whole from public.inv_lot_batches
      where tenant_id = v_tenant and item_id = v_whole and lot_no = 'LOT-S17-WHOLE-1' and location_id = v_loc_plant;
    end if;

    insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
    values (v_tenant, v_whole, v_loc_plant, 80)
    on conflict (tenant_id, item_id, location_id)
    do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, 80), updated_at = now();

    -- SOs: A orders belly kg; B orders pata
    if not exists (select 1 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S17-SO-A') then
      insert into public.so_sales_orders (
        tenant_id, order_date, date_seq, sales_order_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        delivery_date, payment_terms, progress_status,
        subtotal, tax_total, grand_total, created_by_user_id, notes
      ) values (
        v_tenant, v_d, 17, 'DEMO-S17-SO-A',
        v_tax_vat, v_currency_id, v_cust_a, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Meat PIC'),
        v_loc_plant, v_d + 1, 'COD', 'in_progress',
        8960.0000, 1075.2000, 10035.2000, v_user_id,
        'GOLDEN-S17 Cust A — pork belly kg.'
      ) returning id into v_so_a;

      insert into public.so_sales_order_lines (
        sales_order_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_so_a, 1, i.id, i.item_code, i.item_name, 'Belly kg for Cust A',
        28, 320.0000, 8960.0000, 1075.2000, 358.4000, 10035.2000
      from public.inv_items i where i.id = v_belly
      returning id into v_so_a_line;
    else
      select id into v_so_a from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S17-SO-A';
      select id into v_so_a_line from public.so_sales_order_lines where sales_order_id = v_so_a order by line_no limit 1;
    end if;

    if not exists (select 1 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S17-SO-B') then
      insert into public.so_sales_orders (
        tenant_id, order_date, date_seq, sales_order_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        delivery_date, payment_terms, progress_status,
        subtotal, tax_total, grand_total, created_by_user_id, notes
      ) values (
        v_tenant, v_d, 18, 'DEMO-S17-SO-B',
        v_tax_vat, v_currency_id, v_cust_b, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Meat PIC'),
        v_loc_plant, v_d + 1, 'COD', 'in_progress',
        6160.0000, 739.2000, 6899.2000, v_user_id,
        'GOLDEN-S17 Cust B — pork pata kg.'
      ) returning id into v_so_b;

      insert into public.so_sales_order_lines (
        sales_order_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_so_b, 1, i.id, i.item_code, i.item_name, 'Pata kg for Cust B',
        22, 280.0000, 6160.0000, 739.2000, 313.6000, 6899.2000
      from public.inv_items i where i.id = v_pata;
    else
      select id into v_so_b from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S17-SO-B';
    end if;

    -- Completed cut job (actual carcass 78 kg) + seeded cut lots with CW/expiry
    if not exists (select 1 from public.mfg_work_orders where tenant_id = v_tenant and work_order_no = 'DEMO-S17-WO') then
      insert into public.mfg_work_orders (
        tenant_id, work_order_no, bom_id, finished_item_id, location_id,
        qty_to_produce, qty_produced, status, order_date,
        released_at, completed_at, inspection_status, inspected_at,
        actual_input_qty, input_lot_batch_id,
        created_by_user_id, notes
      ) values (
        v_tenant, 'DEMO-S17-WO', v_bom, v_whole, v_loc_plant,
        80, 80, 'completed', v_d,
        v_d::timestamptz, v_d::timestamptz, 'released', v_d::timestamptz,
        78, v_lot_whole,
        v_user_id, 'GOLDEN-S17 meat cut — actual input 78 kg; cut lots seeded for demo.'
      ) returning id into v_wo;

      update public.inv_lot_batches
      set qty_on_hand = greatest(qty_on_hand - 78, 0), updated_at = now()
      where id = v_lot_whole and tenant_id = v_tenant;

      update public.inv_item_location_balances
      set qty_on_hand = greatest(qty_on_hand - 78, 0), updated_at = now()
      where tenant_id = v_tenant and item_id = v_whole and location_id = v_loc_plant;

      -- Actual weighed cuts (two belly lots for FEFO demo)
      insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date)
      values
        (v_tenant, v_belly, 'LOT-S17-BELLY-OLD', v_loc_plant, 12.5, v_d + 2),
        (v_tenant, v_belly, 'LOT-S17-BELLY-NEW', v_loc_plant, 14.8, v_d + 5),
        (v_tenant, v_pata, 'LOT-S17-PATA-1', v_loc_plant, 21.5, v_d + 3),
        (v_tenant, v_ribs, 'LOT-S17-RIBS-1', v_loc_plant, 17.2, v_d + 3)
      on conflict (tenant_id, item_id, lot_no, location_id)
      do update set qty_on_hand = excluded.qty_on_hand, expiry_date = excluded.expiry_date, updated_at = now();

      select id into v_lot_belly_old from public.inv_lot_batches
      where tenant_id = v_tenant and lot_no = 'LOT-S17-BELLY-OLD' and item_id = v_belly;
      select id into v_lot_belly_new from public.inv_lot_batches
      where tenant_id = v_tenant and lot_no = 'LOT-S17-BELLY-NEW' and item_id = v_belly;
      select id into v_lot_pata from public.inv_lot_batches
      where tenant_id = v_tenant and lot_no = 'LOT-S17-PATA-1' and item_id = v_pata;
      select id into v_lot_ribs from public.inv_lot_batches
      where tenant_id = v_tenant and lot_no = 'LOT-S17-RIBS-1' and item_id = v_ribs;

      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
      values
        (v_tenant, v_belly, v_loc_plant, 27.3),
        (v_tenant, v_pata, v_loc_plant, 21.5),
        (v_tenant, v_ribs, v_loc_plant, 17.2)
      on conflict (tenant_id, item_id, location_id)
      do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, excluded.qty_on_hand), updated_at = now();

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values
        (v_tenant, v_whole, v_loc_plant, -78, 'wo_disassembly_issue', 'mfg_work_order', v_wo, v_user_id),
        (v_tenant, v_belly, v_loc_plant, 27.3, 'wo_disassembly_receipt', 'mfg_work_order', v_wo, v_user_id),
        (v_tenant, v_pata, v_loc_plant, 21.5, 'wo_disassembly_receipt', 'mfg_work_order', v_wo, v_user_id),
        (v_tenant, v_ribs, v_loc_plant, 17.2, 'wo_disassembly_receipt', 'mfg_work_order', v_wo, v_user_id);
    else
      select id into v_wo from public.mfg_work_orders where tenant_id = v_tenant and work_order_no = 'DEMO-S17-WO';
      select id into v_lot_belly_old from public.inv_lot_batches
      where tenant_id = v_tenant and lot_no = 'LOT-S17-BELLY-OLD' and item_id = v_belly;
      select id into v_lot_belly_new from public.inv_lot_batches
      where tenant_id = v_tenant and lot_no = 'LOT-S17-BELLY-NEW' and item_id = v_belly;
    end if;

    -- Pack session for Cust A SO (= v1 "box")
    if v_has_pack and v_so_a is not null and not exists (
      select 1 from public.inv_pack_sessions where tenant_id = v_tenant and pack_no = 'DEMO-S17-PACK'
    ) then
      insert into public.inv_pack_sessions (
        tenant_id, pack_no, sales_order_id, location_id, status, notes, created_by_user_id, completed_at
      ) values (
        v_tenant, 'DEMO-S17-PACK', v_so_a, v_loc_plant, 'completed',
        'GOLDEN-S17 pack for M17A (one box per customer).', v_user_id, v_d::timestamptz
      ) returning id into v_pack;

      if v_lot_belly_old is not null then
        insert into public.inv_pack_session_lines (pack_session_id, line_no, item_id, lot_batch_id, qty)
        values (v_pack, 1, v_belly, v_lot_belly_old, 12.5);
      end if;
    end if;

    -- Shipping order for Cust A
    if v_has_ship and v_so_a is not null and v_so_a_line is not null and not exists (
      select 1 from public.sh_shipping_orders where tenant_id = v_tenant and shipping_no = 'DEMO-S17-SHIP-A'
    ) then
      insert into public.sh_shipping_orders (
        tenant_id, shipping_date, date_seq, shipping_no, sales_order_id, partner_id, location_id,
        status, notes, created_by_user_id
      ) values (
        v_tenant, v_d, 17, 'DEMO-S17-SHIP-A', v_so_a, v_cust_a, v_loc_plant,
        'draft', 'GOLDEN-S17 ship box to M17A.', v_user_id
      ) returning id into v_ship;

      insert into public.sh_shipping_order_lines (shipping_order_id, sales_order_line_id, qty, line_no)
      values (v_ship, v_so_a_line, 12.5, 1);
    end if;

    -- FEFO sale of belly: deplete older lot first (same pattern as S13)
    if v_lot_belly_old is not null and v_lot_belly_new is not null
       and not exists (select 1 from public.sa_sales where tenant_id = v_tenant and sales_no = 'DEMO-S17-SI') then
      insert into public.sa_sales (
        tenant_id, order_date, date_seq, sales_no,
        tax_type_id, currency_id, partner_id, pic_user_id, location_id,
        progress_status, template_code, subtotal, tax_total, grand_total, created_by_user_id
      ) values (
        v_tenant, v_d, 17, 'DEMO-S17-SI',
        v_tax_vat, v_currency_id, v_cust_a, v_user_id, v_loc_plant,
        'completed', 'default', 4800.0000, 576.0000, 5376.0000, v_user_id
      ) returning id into v_sale_id;

      insert into public.sa_sales_lines (
        sales_id, line_no, item_id, item_code, item_name,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
        serial_lot_no, lot_batch_id
      )
      select v_sale_id, 1, i.id, i.item_code, i.item_name,
        15, 320.0000, 4800.0000, 576.0000, 358.4000, 5376.0000,
        'LOT-S17-BELLY-OLD', v_lot_belly_old
      from public.inv_items i where i.id = v_belly
      returning id into v_sale_line;

      insert into public.sa_sales_line_lot_allocations (sales_line_id, lot_batch_id, qty)
      values (v_sale_line, v_lot_belly_old, 12.5), (v_sale_line, v_lot_belly_new, 2.5);

      update public.inv_lot_batches set qty_on_hand = 0, updated_at = now()
      where id = v_lot_belly_old and tenant_id = v_tenant;
      update public.inv_lot_batches set qty_on_hand = greatest(qty_on_hand - 2.5, 0), updated_at = now()
      where id = v_lot_belly_new and tenant_id = v_tenant;

      update public.inv_item_location_balances
      set qty_on_hand = greatest(qty_on_hand - 15, 0), updated_at = now()
      where tenant_id = v_tenant and item_id = v_belly and location_id = v_loc_plant;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values (v_tenant, v_belly, v_loc_plant, -15, 'sales', 'sa_sales_line', v_sale_line, v_user_id);
    end if;

    raise notice 'seed-demo-golden-s17: ensured meat cut chain for %', v_code;
  end loop;
end $$;

commit;
