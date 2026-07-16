-- Verify demo tenants have zero reconciliation gaps after full populate.
-- Raises exception on failure.
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_count int;
begin
  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise exception 'verify-reconciliation: tenant % missing', v_code;
    end if;

    -- Serial qty mismatch (sales lines + release lines)
    select count(*) into v_count from (
      select ln.id
      from public.sa_sales_lines ln
      join public.sa_sales s on s.id = ln.sales_id
      join public.inv_items i on i.id = ln.item_id
      left join (
        select sales_line_id, count(*)::float8 as serial_cnt
        from public.inv_serial_unit_sales_lines
        group by sales_line_id
      ) j on j.sales_line_id = ln.id
      where s.tenant_id = v_tenant and s.deleted_at is null
        and i.track_serial = true and ln.qty > 0
        and coalesce(j.serial_cnt, 0) <> ln.qty
      union
      select rl.id
      from public.so_sales_order_release_lines rl
      join public.so_sales_order_lines ln on ln.id = rl.sales_order_line_id
      join public.so_sales_orders so on so.id = ln.sales_order_id
      join public.inv_items i on i.id = ln.item_id
      left join (
        select sales_order_release_line_id, count(*)::float8 as serial_cnt
        from public.inv_serial_units
        where sales_order_release_line_id is not null
        group by sales_order_release_line_id
      ) su on su.sales_order_release_line_id = rl.id
      where so.tenant_id = v_tenant and so.deleted_at is null
        and i.track_serial = true and rl.release_qty > 0
        and coalesce(su.serial_cnt, 0) <> rl.release_qty
    ) mismatches;
    if v_count > 0 then
      raise exception 'verify-reconciliation [%]: serial qty mismatch count %', v_code, v_count;
    end if;

    -- Delivered not invoiced
    select count(distinct ln.id) into v_count
    from public.so_sales_order_lines ln
    join public.so_sales_orders so on so.id = ln.sales_order_id
    left join (
      select sales_order_line_id, sum(qty) as delivered
      from public.so_sales_order_slip_lines
      where slip_type = 'delivery_receipt'
      group by sales_order_line_id
    ) dr on dr.sales_order_line_id = ln.id
    left join (
      select sales_order_line_id, sum(qty) as sold
      from public.so_sales_order_slip_lines
      where slip_type = 'sales'
      group by sales_order_line_id
    ) slip on slip.sales_order_line_id = ln.id
    where so.tenant_id = v_tenant and so.deleted_at is null
      and coalesce(dr.delivered, 0) > 0.0001
      and (coalesce(dr.delivered, 0) - coalesce(slip.sold, 0)) > 0.0001
      and so.sales_order_no not like 'DEMO-S9-%';
    if v_count > 0 then
      raise exception 'verify-reconciliation [%]: dr without invoice gaps %', v_code, v_count;
    end if;

    -- GR not fully billed.
    -- Exclude: open-receive demos (DEMOGR*), S2 (stock→sales chain, no AP), S3 (billed by finance-ap; keep defensive).
    select count(*) into v_count
    from public.gr_goods_receipt_lines grl
    join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
    join public.po_purchase_orders po on po.id = gr.purchase_order_id
    left join (
      select goods_receipt_line_id, sum(qty) as billed
      from public.gr_goods_receipt_slip_lines
      where slip_type = 'supplier_invoice'
      group by goods_receipt_line_id
    ) sl on sl.goods_receipt_line_id = grl.id
    where gr.tenant_id = v_tenant and gr.status = 'posted'
      and po.purchase_order_no not like 'DEMOGR%'
      and po.purchase_order_no not in ('DEMO-S2-PO', 'DEMO-S3-PO')
      and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001;
    if v_count > 0 then
      raise exception 'verify-reconciliation [%]: gr without supplier invoice gaps %', v_code, v_count;
    end if;

    -- Standalone PO S11
    if not exists (
      select 1 from public.po_purchase_orders
      where tenant_id = v_tenant and purchase_order_no = 'DEMO-S11-PO' and purchase_request_id is null
    ) then
      raise exception 'verify-reconciliation [%]: S11 standalone PO missing', v_code;
    end if;

    raise notice 'verify-reconciliation: OK for %', v_code;
  end loop;
end $$;

commit;
