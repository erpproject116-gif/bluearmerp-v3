-- Golden scenarios S14–S16: production MTO, MTS, and disassembly
-- Run after seed-demo-golden-scenarios.sql (same tenant loop pattern as S13)
-- Idempotent: DEMO-S14-* / DEMO-S15-* / DEMO-S16-* document numbers

begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_d date := date '2025-06-15';
  v_user_id bigint;
  v_loc_hq bigint;
  v_loc_plant bigint;
  v_partner_sm bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_item_sofa bigint;
  v_item_panel bigint;
  v_item_foam bigint;
  v_item_fabric bigint;
  v_bom_s14 bigint;
  v_bom_s16 bigint;
  v_soid bigint;
  v_soline bigint;
  v_woid_s14 bigint;
  v_woid_s15 bigint;
  v_woid_s16 bigint;
  v_has_bom_type boolean;
  v_has_mfg_inspection boolean;
  v_has_mfg_so_link boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mfg_boms' and column_name = 'bom_type'
  ) into v_has_bom_type;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mfg_work_orders' and column_name = 'inspection_status'
  ) into v_has_mfg_inspection;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mfg_work_orders' and column_name = 'source_sales_order_line_id'
  ) into v_has_mfg_so_link;

  if not v_has_mfg_inspection or not v_has_mfg_so_link then
    raise exception 'seed-demo-golden-s14-s16: apply api/migrations/272_mfg_fg_inspection.sql and 274_mfg_so_link.sql before running this seed';
  end if;

  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_loc_hq from public.inv_locations where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_loc_plant from public.inv_locations where tenant_id = v_tenant and location_code = '00002' limit 1;
    select id into v_partner_sm from public.inv_partners where tenant_id = v_tenant and partner_code = '00001' limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and deleted_at is null
    order by case when name = 'Vat Included' then 0 else 1 end, sort_order limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_item_sofa from public.inv_items where tenant_id = v_tenant and item_code = '00001' limit 1;
    select id into v_item_panel from public.inv_items where tenant_id = v_tenant and item_code = '00002' limit 1;
    select id into v_item_foam from public.inv_items where tenant_id = v_tenant and item_code = '00003' limit 1;
    select id into v_item_fabric from public.inv_items where tenant_id = v_tenant and item_code = '00004' limit 1;

    if v_user_id is null or v_tax_vat is null or v_currency_id is null
       or v_loc_hq is null or v_loc_plant is null or v_partner_sm is null
       or v_item_sofa is null or v_item_panel is null or v_item_foam is null or v_item_fabric is null then
      raise warning 'seed-demo-golden-s14-s16: missing master data for % — skip', v_code;
      continue;
    end if;

    update public.inv_items set track_inventory_qty = true
    where tenant_id = v_tenant and item_code in ('00001', '00002', '00003', '00004');

    -- Ensure base UoM + lot tracking on demo cut SKUs for floor weigh.
    -- inv_items_track_serial_lot_exclusive: lot and serial cannot both be true
    -- (migration 264 may have enabled serial on these rows).
    update public.inv_items i
    set base_unit_id = coalesce(
          i.base_unit_id,
          (select u.id from public.inv_units u where u.tenant_id = i.tenant_id order by u.id limit 1)
        ),
        track_lot = case when i.item_code in ('00002', '00003', '00004') then true else i.track_lot end,
        track_serial = case when i.item_code in ('00002', '00003', '00004') then false else i.track_serial end,
        track_inventory_qty = true
    where i.tenant_id = v_tenant and i.item_code in ('00001', '00002', '00003', '00004');

    -- Component stock at assembly plant (00002) for backflush demos
    insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
    values
      (v_tenant, v_item_panel, v_loc_plant, 24),
      (v_tenant, v_item_foam, v_loc_plant, 12),
      (v_tenant, v_item_fabric, v_loc_plant, 30),
      (v_tenant, v_item_sofa, v_loc_plant, 2)
    on conflict (tenant_id, item_id, location_id)
    do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, excluded.qty_on_hand),
                  updated_at = now();

    -- HQ balances so Inv. Balance by Location shows multi-branch columns
    insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
    values
      (v_tenant, v_item_panel, v_loc_hq, 4),
      (v_tenant, v_item_foam, v_loc_hq, 2),
      (v_tenant, v_item_fabric, v_loc_hq, 8),
      (v_tenant, v_item_sofa, v_loc_hq, 1)
    on conflict (tenant_id, item_id, location_id)
    do update set qty_on_hand = greatest(inv_item_location_balances.qty_on_hand, excluded.qty_on_hand),
                  updated_at = now();

    -- === BOM DEMO-S14-BOM (assembly) ===
    if not exists (select 1 from public.mfg_boms where tenant_id = v_tenant and bom_code = 'DEMO-S14-BOM') then
      insert into public.mfg_boms (
        tenant_id, bom_code, bom_name, finished_item_id, default_location_id,
        output_qty, yield_pct, is_active, notes
      )
      values (
        v_tenant, 'DEMO-S14-BOM', 'Modular Sofa — standard assembly', v_item_sofa, v_loc_plant,
        1, 100, true, 'GOLDEN-S14/S15 assembly BOM (00001 ← 00002×2 + 00003×1 + 00004×3).'
      ) returning id into v_bom_s14;

      insert into public.mfg_bom_lines (bom_id, line_no, component_item_id, qty, scrap_qty)
      values
        (v_bom_s14, 1, v_item_panel, 2, 0),
        (v_bom_s14, 2, v_item_foam, 1, 0),
        (v_bom_s14, 3, v_item_fabric, 3, 0);
    else
      select id into v_bom_s14 from public.mfg_boms where tenant_id = v_tenant and bom_code = 'DEMO-S14-BOM';
    end if;

    -- === S14 MTO: SO → WO (completed) ===
    if not exists (select 1 from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S14-SO') then
      insert into public.so_sales_orders (
        tenant_id, order_date, date_seq, sales_order_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        delivery_date, payment_terms, progress_status,
        subtotal, tax_total, grand_total, created_by_user_id, notes
      )
      values (
        v_tenant, v_d, 14, 'DEMO-S14-SO',
        v_tax_vat, v_currency_id, v_partner_sm, v_user_id,
        coalesce((select full_name from public.users where id = v_user_id), 'Production PIC'),
        v_loc_plant, v_d + 7, '30 DAYS', 'in_progress',
        6250.0000, 750.0000, 7000.0000, v_user_id,
        'GOLDEN-S14 make-to-order sofa — linked work order.'
      ) returning id into v_soid;

      insert into public.so_sales_order_lines (
        sales_order_id, line_no, item_id, item_code, item_name, description,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
      )
      select v_soid, 1, i.id, i.item_code, i.item_name, 'MTO modular sofa for S14',
        1, 6250.0000, 6250.0000, 750.0000, 7000.0000, 7000.0000
      from public.inv_items i where i.id = v_item_sofa
      returning id into v_soline;
    else
      select id into v_soid from public.so_sales_orders where tenant_id = v_tenant and sales_order_no = 'DEMO-S14-SO';
      select id into v_soline from public.so_sales_order_lines where sales_order_id = v_soid order by line_no limit 1;
    end if;

    if not exists (select 1 from public.mfg_work_orders where tenant_id = v_tenant and work_order_no = 'DEMO-S14-WO') then
      insert into public.mfg_work_orders (
        tenant_id, work_order_no, bom_id, finished_item_id, location_id,
        qty_to_produce, qty_produced, status, order_date,
        released_at, completed_at, inspection_status, inspected_at,
        source_sales_order_id, source_sales_order_line_id,
        created_by_user_id, notes
      )
      values (
        v_tenant, 'DEMO-S14-WO', v_bom_s14, v_item_sofa, v_loc_plant,
        1, 1, 'completed', v_d,
        v_d::timestamptz, v_d::timestamptz, 'released', v_d::timestamptz,
        v_soid, v_soline,
        v_user_id, 'GOLDEN-S14 MTO work order — completed with FG QC released.'
      ) returning id into v_woid_s14;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 2, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_panel and location_id = v_loc_plant;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 1, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_foam and location_id = v_loc_plant;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 3, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_fabric and location_id = v_loc_plant;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand + 1, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_sofa and location_id = v_loc_plant;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values
        (v_tenant, v_item_panel, v_loc_plant, -2, 'wo_backflush_issue', 'mfg_work_order', v_woid_s14, v_user_id),
        (v_tenant, v_item_foam, v_loc_plant, -1, 'wo_backflush_issue', 'mfg_work_order', v_woid_s14, v_user_id),
        (v_tenant, v_item_fabric, v_loc_plant, -3, 'wo_backflush_issue', 'mfg_work_order', v_woid_s14, v_user_id),
        (v_tenant, v_item_sofa, v_loc_plant, 1, 'wo_backflush_receipt', 'mfg_work_order', v_woid_s14, v_user_id);
    else
      select id into v_woid_s14 from public.mfg_work_orders where tenant_id = v_tenant and work_order_no = 'DEMO-S14-WO';
    end if;

    -- === S15 MTS: WO without SO link ===
    if not exists (select 1 from public.mfg_work_orders where tenant_id = v_tenant and work_order_no = 'DEMO-S15-WO') then
      insert into public.mfg_work_orders (
        tenant_id, work_order_no, bom_id, finished_item_id, location_id,
        qty_to_produce, qty_produced, status, order_date,
        released_at, completed_at, inspection_status, inspected_at,
        created_by_user_id, notes
      )
      values (
        v_tenant, 'DEMO-S15-WO', v_bom_s14, v_item_sofa, v_loc_plant,
        1, 1, 'completed', v_d,
        v_d::timestamptz, v_d::timestamptz, 'released', v_d::timestamptz,
        v_user_id, 'GOLDEN-S15 make-to-stock work order — no sales order link.'
      ) returning id into v_woid_s15;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 2, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_panel and location_id = v_loc_plant;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 1, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_foam and location_id = v_loc_plant;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand - 3, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_fabric and location_id = v_loc_plant;

      update public.inv_item_location_balances
      set qty_on_hand = qty_on_hand + 1, updated_at = now()
      where tenant_id = v_tenant and item_id = v_item_sofa and location_id = v_loc_plant;

      insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
      values
        (v_tenant, v_item_panel, v_loc_plant, -2, 'wo_backflush_issue', 'mfg_work_order', v_woid_s15, v_user_id),
        (v_tenant, v_item_foam, v_loc_plant, -1, 'wo_backflush_issue', 'mfg_work_order', v_woid_s15, v_user_id),
        (v_tenant, v_item_fabric, v_loc_plant, -3, 'wo_backflush_issue', 'mfg_work_order', v_woid_s15, v_user_id),
        (v_tenant, v_item_sofa, v_loc_plant, 1, 'wo_backflush_receipt', 'mfg_work_order', v_woid_s15, v_user_id);
    end if;

    -- === S16 disassembly (requires bom_type column) ===
    if v_has_bom_type then
      if not exists (select 1 from public.mfg_boms where tenant_id = v_tenant and bom_code = 'DEMO-S16-BOM') then
        insert into public.mfg_boms (
          tenant_id, bom_code, bom_name, finished_item_id, default_location_id,
          output_qty, yield_pct, bom_type, expected_yield_pct_min, expected_yield_pct_max,
          is_active, notes
        )
        values (
          v_tenant, 'DEMO-S16-BOM', 'Fabric roll — cut & recover yield', v_item_fabric, v_loc_plant,
          10, 100, 'disassembly', 85, 95, true,
          'GOLDEN-S16 disassembly: consume fabric roll, receive foam/panel salvage.'
        ) returning id into v_bom_s16;

        insert into public.mfg_bom_lines (bom_id, line_no, component_item_id, qty, scrap_qty)
        values
          (v_bom_s16, 1, v_item_foam, 1.8, 0),
          (v_bom_s16, 2, v_item_panel, 0.4, 0);
      else
        select id into v_bom_s16 from public.mfg_boms where tenant_id = v_tenant and bom_code = 'DEMO-S16-BOM';
      end if;

      if not exists (select 1 from public.mfg_work_orders where tenant_id = v_tenant and work_order_no = 'DEMO-S16-WO') then
        insert into public.mfg_work_orders (
          tenant_id, work_order_no, bom_id, finished_item_id, location_id,
          qty_to_produce, qty_produced, status, order_date,
          released_at, completed_at, inspection_status, inspected_at,
          actual_input_qty, created_by_user_id, notes
        )
        values (
          v_tenant, 'DEMO-S16-WO', v_bom_s16, v_item_fabric, v_loc_plant,
          10, 10, 'completed', v_d,
          v_d::timestamptz, v_d::timestamptz, 'released', v_d::timestamptz,
          9.2, v_user_id, 'GOLDEN-S16 disassembly — actual input 9.2 m vs 10 m planned.'
        ) returning id into v_woid_s16;

        update public.inv_item_location_balances
        set qty_on_hand = qty_on_hand - 9.2, updated_at = now()
        where tenant_id = v_tenant and item_id = v_item_fabric and location_id = v_loc_plant;

        update public.inv_item_location_balances
        set qty_on_hand = qty_on_hand + 1.656, updated_at = now()
        where tenant_id = v_tenant and item_id = v_item_foam and location_id = v_loc_plant;

        update public.inv_item_location_balances
        set qty_on_hand = qty_on_hand + 0.368, updated_at = now()
        where tenant_id = v_tenant and item_id = v_item_panel and location_id = v_loc_plant;

        insert into public.inv_stock_movements (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
        values
          (v_tenant, v_item_fabric, v_loc_plant, -9.2, 'wo_disassembly_issue', 'mfg_work_order', v_woid_s16, v_user_id),
          (v_tenant, v_item_foam, v_loc_plant, 1.656, 'wo_disassembly_receipt', 'mfg_work_order', v_woid_s16, v_user_id),
          (v_tenant, v_item_panel, v_loc_plant, 0.368, 'wo_disassembly_receipt', 'mfg_work_order', v_woid_s16, v_user_id);
      end if;

      -- Open released disassembly job for floor walkthrough (Issue whole → Weigh cuts → Complete)
      if not exists (select 1 from public.mfg_work_orders where tenant_id = v_tenant and work_order_no = 'DEMO-S16-OPEN') then
        insert into public.mfg_work_orders (
          tenant_id, work_order_no, bom_id, finished_item_id, location_id,
          qty_to_produce, qty_produced, status, order_date,
          released_at, inspection_status, inspected_at,
          created_by_user_id, notes
        )
        values (
          v_tenant, 'DEMO-S16-OPEN', v_bom_s16, v_item_fabric, v_loc_plant,
          5, 0, 'released', v_d,
          now(), 'released', now(),
          v_user_id, 'GOLDEN-S16 open walkthrough — use Weigh cuts then Complete.'
        );
      end if;
    else
      raise notice 'seed-demo-golden-s14-s16: bom_type column missing — S16 disassembly skipped for %', v_code;
    end if;

    raise notice 'seed-demo-golden-s14-s16: ensured S14/S15/S16 production chain for %', v_code;
  end loop;
end $$;

commit;
