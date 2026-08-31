-- Verify golden demo scenario linkage (run after seed-demo-full-chain.sql or supabase db seed)
-- Tenants without golden scenarios (no DEMO-S2-PR) are skipped with a notice.
-- Raises exception on failure for seeded tenants.
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_count int;
  v_sold int;
  v_in_stock int;
  v_reserved int;
  v_lot_qty numeric;
  v_sale_line bigint;
  v_has_mfg_inspection boolean;
  v_has_mfg_so_link boolean;
  v_has_bom_type boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mfg_work_orders' and column_name = 'inspection_status'
  ) into v_has_mfg_inspection;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mfg_work_orders' and column_name = 'source_sales_order_line_id'
  ) into v_has_mfg_so_link;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mfg_boms' and column_name = 'bom_type'
  ) into v_has_bom_type;

  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise exception 'verify-full-chain: tenant % missing', v_code;
    end if;

    -- Skip tenants that never received golden scenario seeds (e.g. production BLUEARM without demo reload).
    if not exists (
      select 1 from public.pr_purchase_requests
      where tenant_id = v_tenant and purchase_request_no = 'DEMO-S2-PR'
    ) then
      raise notice 'verify-full-chain [%]: skipping — golden scenarios not seeded (run scripts/seed-demo-inventory.sql then seed-demo-golden-scenarios.sql)', v_code;
      continue;
    end if;

    -- S2: posted GR + PO + PR
    if not exists (
      select 1 from public.pr_purchase_requests pr
      join public.po_purchase_orders po on po.purchase_request_id = pr.id
      join public.gr_goods_receipts gr on gr.purchase_order_id = po.id and gr.status = 'posted'
      where pr.tenant_id = v_tenant and pr.purchase_request_no = 'DEMO-S2-PR'
    ) then
      raise exception 'verify-full-chain [%]: S2 PR→PO→GR chain incomplete — DEMO-S2-PR exists but posted GR missing; re-run scripts/seed-demo-golden-scenarios.sql', v_code;
    end if;

    select count(*) into v_count
    from public.inv_serial_units
    where tenant_id = v_tenant and serial_no like v_code || '-S2-%';
    if v_count < 5 then
      raise exception 'verify-full-chain [%]: expected >= 5 S2 serial units, got %', v_code, v_count;
    end if;

    select count(*) into v_sold
    from public.inv_serial_units
    where tenant_id = v_tenant and serial_no like v_code || '-S2-%' and status = 'sold';
    if v_sold <> 2 then
      raise exception 'verify-full-chain [%]: expected 2 sold S2 serials, got %', v_code, v_sold;
    end if;

    select count(*) into v_count
    from public.inv_serial_unit_sales_lines j
    join public.sa_sales_lines ln on ln.id = j.sales_line_id
    join public.sa_sales s on s.id = ln.sales_id
    where s.tenant_id = v_tenant and s.sales_no = 'DEMO-S2-SI';
    if v_count <> 2 then
      raise exception 'verify-full-chain [%]: expected 2 serial sales links on DEMO-S2-SI, got %', v_code, v_count;
    end if;

    if not exists (
      select 1 from public.so_sales_orders so
      join public.so_sales_order_slip_lines sl on sl.sales_order_line_id in (
        select id from public.so_sales_order_lines where sales_order_id = so.id
      )
      where so.tenant_id = v_tenant and so.sales_order_no = 'DEMO-S2-SO'
        and sl.slip_type = 'sales' and sl.slip_ref = 'DEMO-S2-SI'
    ) then
      raise exception 'verify-full-chain [%]: SO slip line to DEMO-S2-SI missing', v_code;
    end if;

    -- S3: lot batch
    select lb.qty_on_hand into v_lot_qty
    from public.inv_lot_batches lb
    join public.inv_items i on i.id = lb.item_id
    where lb.tenant_id = v_tenant and lb.lot_no = 'LOT-S3-A' and i.item_code = '00004';
    if v_lot_qty is null then
      raise exception 'verify-full-chain [%]: S3 lot batch LOT-S3-A missing', v_code;
    end if;
    if v_lot_qty < 40 then
      raise exception 'verify-full-chain [%]: S3 lot qty expected ~40 after sale, got %', v_code, v_lot_qty;
    end if;

    if not exists (
      select 1 from public.sa_sales s
      join public.sa_sales_lines ln on ln.sales_id = s.id and ln.lot_batch_id is not null
      where s.tenant_id = v_tenant and s.sales_no = 'DEMO-S3-SI'
    ) then
      raise exception 'verify-full-chain [%]: DEMO-S3-SI with lot_batch_id missing', v_code;
    end if;

    -- S4: direct sale
    if not exists (
      select 1 from public.sa_sales s
      join public.sa_sales_lines ln on ln.sales_id = s.id and ln.source_sales_order_line_id is null
      join public.inv_stock_movements m on m.ref_type = 'sa_sales_line' and m.ref_id = ln.id and m.movement_type = 'sales'
      where s.tenant_id = v_tenant and s.sales_no = 'DEMO-S4-SI'
    ) then
      raise exception 'verify-full-chain [%]: S4 direct sale with stock movement missing', v_code;
    end if;

    -- Process policies seeded
    if not exists (select 1 from public.tenant_process_policies where tenant_id = v_tenant) then
      raise exception 'verify-full-chain [%]: tenant_process_policies row missing', v_code;
    end if;

    -- S8: AP supplier invoice + partial payment against S3 GR
    if not exists (
      select 1 from public.fin_supplier_invoices si
      join public.fin_supplier_invoice_lines sil on sil.supplier_invoice_id = si.id
      join public.gr_goods_receipt_lines grl on grl.id = sil.goods_receipt_line_id
      join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
      join public.po_purchase_orders po on po.id = gr.purchase_order_id
      where si.tenant_id = v_tenant and si.invoice_no = 'DEMO-S8-AP'
        and po.purchase_order_no = 'DEMO-S3-PO' and si.deleted_at is null
    ) then
      raise exception 'verify-full-chain [%]: S8 supplier invoice against S3 GR missing — run scripts/seed-demo-finance-ap.sql after golden scenarios', v_code;
    end if;

    select coalesce(sum(pa.applied_amount), 0) into v_lot_qty
    from public.fin_payment_applications pa
    join public.fin_supplier_invoices si on si.id = pa.supplier_invoice_id
    where si.tenant_id = v_tenant and si.invoice_no = 'DEMO-S8-AP' and si.deleted_at is null;

    if v_lot_qty <> 30000 then
      raise exception 'verify-full-chain [%]: S8 expected partial payment 30000, got %', v_code, v_lot_qty;
    end if;

    -- S10: PR approval light
    if not exists (
      select 1 from public.pr_purchase_requests
      where tenant_id = v_tenant and purchase_request_no = 'DEMO-S10-PR'
        and progress_status = 'e_approval' and approved_at is null
    ) then
      raise exception 'verify-full-chain [%]: S10 pending PR missing', v_code;
    end if;

    if not exists (
      select 1 from public.pr_purchase_requests pr
      join public.po_purchase_orders po on po.purchase_request_id = pr.id
      where pr.tenant_id = v_tenant and pr.purchase_request_no = 'DEMO-S10-PR-OK'
        and pr.approved_at is not null and pr.progress_status = 'confirmed'
        and po.purchase_order_no = 'DEMO-S10-PO'
    ) then
      raise exception 'verify-full-chain [%]: S10 approved PR→PO chain missing', v_code;
    end if;

    -- S9: SO → reserve → DR → SI
    if not exists (
      select 1 from public.so_sales_orders so
      join public.so_sales_order_lines ln on ln.sales_order_id = so.id
      join public.so_sales_order_release_lines rl on rl.sales_order_line_id = ln.id
      join public.dr_delivery_receipts dr on dr.sales_order_id = so.id and dr.status = 'posted'
      join public.dr_delivery_receipt_lines drl on drl.delivery_receipt_id = dr.id and drl.sales_order_line_id = ln.id
      join public.so_sales_order_slip_lines slip_dr on slip_dr.sales_order_line_id = ln.id and slip_dr.slip_type = 'delivery_receipt'
      join public.sa_sales si on si.source_sales_order_id = so.id and si.sales_no = 'DEMO-S9-SI'
      join public.so_sales_order_slip_lines slip_si on slip_si.sales_order_line_id = ln.id and slip_si.slip_type = 'sales' and slip_si.sales_id = si.id
      where so.tenant_id = v_tenant and so.sales_order_no = 'DEMO-S9-SO' and so.deleted_at is null
        and dr.delivery_no = 'DEMO-S9-DR' and rl.release_qty = 2 and drl.qty = 2 and slip_dr.qty = 2 and slip_si.qty = 2
    ) then
      raise exception 'verify-full-chain [%]: S9 SO→reserve→DR→SI chain missing', v_code;
    end if;

    -- S13: perishable catch-weight FEFO
    if not exists (
      select 1 from public.pr_purchase_requests pr
      join public.po_purchase_orders po on po.purchase_request_id = pr.id
      join public.gr_goods_receipts gr on gr.purchase_order_id = po.id and gr.status = 'posted'
      where pr.tenant_id = v_tenant and pr.purchase_request_no = 'DEMO-S13-PR'
    ) then
      raise exception 'verify-full-chain [%]: S13 PR→PO→GR chain missing — run scripts/seed-demo-golden-s13-perishable.sql', v_code;
    end if;

    select lb.qty_on_hand into v_lot_qty
    from public.inv_lot_batches lb
    where lb.tenant_id = v_tenant and lb.lot_no = 'LOT-S13-A';
    if v_lot_qty is null then
      raise exception 'verify-full-chain [%]: S13 lot LOT-S13-A missing', v_code;
    end if;
    if v_lot_qty > 0.0001 then
      raise exception 'verify-full-chain [%]: S13 FEFO should deplete older lot LOT-S13-A, qty=%', v_code, v_lot_qty;
    end if;

    if not exists (
      select 1 from public.sa_sales s
      join public.sa_sales_line_lot_allocations a on a.sales_line_id in (
        select id from public.sa_sales_lines where sales_id = s.id
      )
      where s.tenant_id = v_tenant and s.sales_no = 'DEMO-S13-SI'
    ) then
      raise exception 'verify-full-chain [%]: DEMO-S13-SI lot allocations missing', v_code;
    end if;

    -- S14–S16: production module (requires migrations 272 + 274; S16 also needs bom_type from 270)
    if not v_has_mfg_inspection or not v_has_mfg_so_link then
      raise exception 'verify-full-chain [%]: production migrations not applied — run api/migrations/272_mfg_fg_inspection.sql and 274_mfg_so_link.sql (then seed-demo-golden-s14-s16-production.sql)', v_code;
    end if;

    -- S14: MTO SO → completed WO with FG QC released
    if not exists (
      select 1 from public.so_sales_orders so
      join public.so_sales_order_lines ln on ln.sales_order_id = so.id
      join public.mfg_work_orders wo on wo.source_sales_order_line_id = ln.id
      join public.inv_items i on i.id = ln.item_id
      where so.tenant_id = v_tenant and so.sales_order_no = 'DEMO-S14-SO'
        and wo.work_order_no = 'DEMO-S14-WO' and wo.status = 'completed'
        and wo.inspection_status = 'released' and wo.qty_produced = 1
        and i.item_code = '00001'
    ) then
      raise exception 'verify-full-chain [%]: S14 MTO SO→WO chain missing — run scripts/seed-demo-golden-s14-s16-production.sql', v_code;
    end if;

    select count(*) into v_count
    from public.inv_stock_movements sm
    join public.mfg_work_orders wo on wo.id = sm.ref_id and wo.tenant_id = sm.tenant_id
    where sm.tenant_id = v_tenant and sm.ref_type = 'mfg_work_order'
      and wo.work_order_no = 'DEMO-S14-WO';
    if v_count < 1 then
      raise exception 'verify-full-chain [%]: S14 expected stock movements on DEMO-S14-WO, got %', v_code, v_count;
    end if;

    -- S15: MTS completed WO without SO link
    if not exists (
      select 1 from public.mfg_work_orders wo
      join public.mfg_boms b on b.id = wo.bom_id
      where wo.tenant_id = v_tenant and wo.work_order_no = 'DEMO-S15-WO'
        and wo.status = 'completed' and wo.qty_produced = 1
        and wo.source_sales_order_line_id is null
        and b.bom_code in ('DEMO-S14-BOM', 'DEMO-S15-BOM')
    ) then
      raise exception 'verify-full-chain [%]: S15 MTS work order missing — run scripts/seed-demo-golden-s14-s16-production.sql', v_code;
    end if;

    -- S16: disassembly WO with actual_input_qty (when bom_type migration applied)
    if v_has_bom_type then
      if not exists (
        select 1 from public.mfg_work_orders wo
        join public.mfg_boms b on b.id = wo.bom_id and b.bom_type = 'disassembly'
        where wo.tenant_id = v_tenant and wo.work_order_no = 'DEMO-S16-WO'
          and wo.status = 'completed' and wo.actual_input_qty is not null
          and b.bom_code = 'DEMO-S16-BOM'
      ) then
        raise exception 'verify-full-chain [%]: S16 disassembly WO missing — run scripts/seed-demo-golden-s14-s16-production.sql', v_code;
      end if;
    else
      raise notice 'verify-full-chain [%]: S16 skipped — migration 270_mfg_disassembly_phase3.sql (bom_type) not applied', v_code;
    end if;

    -- S17: meat cut disassembly + catch-weight lots + pack/ship + FEFO sale
    if v_has_bom_type then
      if not exists (
        select 1 from public.mfg_work_orders wo
        join public.mfg_boms b on b.id = wo.bom_id and b.bom_type = 'disassembly'
        where wo.tenant_id = v_tenant and wo.work_order_no = 'DEMO-S17-WO'
          and wo.status = 'completed' and wo.actual_input_qty is not null
          and b.bom_code = 'DEMO-S17-BOM'
      ) then
        raise exception 'verify-full-chain [%]: S17 meat WO missing — run scripts/seed-demo-golden-s17-meat-cut.sql', v_code;
      end if;

      if not exists (
        select 1 from public.inv_lot_batches lb
        join public.inv_items i on i.id = lb.item_id
        where lb.tenant_id = v_tenant and i.item_code = 'S17BL'
          and lb.lot_no in ('LOT-S17-BELLY-OLD', 'LOT-S17-BELLY-NEW')
          and lb.qty_on_hand >= 0 and lb.expiry_date is not null
      ) then
        raise exception 'verify-full-chain [%]: S17 belly cut lots missing', v_code;
      end if;

      if not exists (
        select 1 from public.inv_lot_batches lb
        join public.inv_items i on i.id = lb.item_id
        where lb.tenant_id = v_tenant and i.item_code = 'S17PT'
          and lb.lot_no = 'LOT-S17-PATA-1' and lb.qty_on_hand > 0 and lb.expiry_date is not null
      ) then
        raise exception 'verify-full-chain [%]: S17 pata cut lot missing', v_code;
      end if;

      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inv_pack_sessions') then
        if not exists (
          select 1 from public.inv_pack_sessions ps
          join public.so_sales_orders so on so.id = ps.sales_order_id
          where ps.tenant_id = v_tenant and ps.pack_no = 'DEMO-S17-PACK'
            and so.sales_order_no = 'DEMO-S17-SO-A'
        ) then
          raise exception 'verify-full-chain [%]: S17 pack DEMO-S17-PACK for Cust A missing', v_code;
        end if;
      end if;

      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sh_shipping_orders') then
        if not exists (
          select 1 from public.sh_shipping_orders sh
          where sh.tenant_id = v_tenant and sh.shipping_no = 'DEMO-S17-SHIP-A'
        ) then
          raise exception 'verify-full-chain [%]: S17 shipping DEMO-S17-SHIP-A missing', v_code;
        end if;
      end if;

      -- FEFO: older belly lot fully depleted by DEMO-S17-SI
      select lb.qty_on_hand into v_lot_qty
      from public.inv_lot_batches lb
      where lb.tenant_id = v_tenant and lb.lot_no = 'LOT-S17-BELLY-OLD';
      if v_lot_qty is null then
        raise exception 'verify-full-chain [%]: S17 lot LOT-S17-BELLY-OLD missing', v_code;
      end if;
      if v_lot_qty > 0.0001 then
        raise exception 'verify-full-chain [%]: S17 FEFO should deplete older lot LOT-S17-BELLY-OLD, qty=%', v_code, v_lot_qty;
      end if;
      if not exists (
        select 1 from public.sa_sales_line_lot_allocations a
        join public.sa_sales_lines sl on sl.id = a.sales_line_id
        join public.sa_sales s on s.id = sl.sales_id
        where s.tenant_id = v_tenant and s.sales_no = 'DEMO-S17-SI'
      ) then
        raise exception 'verify-full-chain [%]: DEMO-S17-SI lot allocations missing', v_code;
      end if;
    end if;

    -- Platform feature gap closure: default doc generation rules seeded
    select count(*) into v_count
    from public.doc_generation_rules
    where tenant_id = v_tenant and active;
    if v_count < 5 then
      raise exception 'verify-full-chain [%]: expected >= 5 doc generation rules, got %', v_code, v_count;
    end if;

    raise notice 'verify-full-chain: OK for %', v_code;
  end loop;
end $$;

commit;
