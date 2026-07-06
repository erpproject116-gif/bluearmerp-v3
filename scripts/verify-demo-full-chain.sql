-- Verify golden demo scenario linkage (run after seed-demo-full-chain.sql)
-- Raises exception on failure.
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
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise exception 'verify-full-chain: tenant % missing', v_code;
    end if;

    -- S2: posted GR + PO + PR
    if not exists (
      select 1 from public.pr_purchase_requests pr
      join public.po_purchase_orders po on po.purchase_request_id = pr.id
      join public.gr_goods_receipts gr on gr.purchase_order_id = po.id and gr.status = 'posted'
      where pr.tenant_id = v_tenant and pr.purchase_request_no = 'DEMO-S2-PR'
    ) then
      raise exception 'verify-full-chain [%]: S2 PR→PO→GR chain missing', v_code;
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
