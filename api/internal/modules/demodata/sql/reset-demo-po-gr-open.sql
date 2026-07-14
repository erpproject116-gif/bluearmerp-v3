-- Surgical reopen of DEMOGR902 (and refresh DEMOGR903 open qty) for Receive / Scan e2e.
-- Does NOT purge other demo documents. Safe to re-run.
-- After: psql "$DATABASE_URL" -f scripts/verify-demo-po-gr-open.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_poid bigint;
  v_item bigint;
  v_loc bigint;
  v_n int;
  r record;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_poid
    from public.po_purchase_orders
    where tenant_id = v_tenant and purchase_order_no = 'DEMOGR902';
    if v_poid is null then
      raise notice 'reset-demo-po-gr-open: DEMOGR902 missing for % — run seed-demo-po-gr-open.sql first', v_code;
      continue;
    end if;

    -- Serial units received against this PO's GRs
    delete from public.inv_serial_events
    where serial_unit_id in (
      select su.id from public.inv_serial_units su
      where su.tenant_id = v_tenant
        and su.goods_receipt_line_id in (
          select ln.id from public.gr_goods_receipt_lines ln
          join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
          where gr.purchase_order_id = v_poid
        )
    );

    delete from public.inv_serial_unit_sales_lines
    where serial_unit_id in (
      select su.id from public.inv_serial_units su
      where su.tenant_id = v_tenant
        and su.goods_receipt_line_id in (
          select ln.id from public.gr_goods_receipt_lines ln
          join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
          where gr.purchase_order_id = v_poid
        )
    );

    -- Adjust on-hand for serials we are about to remove (posted receipts only)
    for r in
      select coalesce(sum(ln.received_qty), 0)::int as qty, gr.location_id, pol.item_id
      from public.gr_goods_receipts gr
      join public.gr_goods_receipt_lines ln on ln.goods_receipt_id = gr.id
      join public.po_purchase_order_lines pol on pol.id = ln.purchase_order_line_id
      where gr.purchase_order_id = v_poid and gr.status = 'posted'
      group by gr.location_id, pol.item_id
    loop
      if r.qty > 0 then
        update public.inv_item_location_balances
        set qty_on_hand = greatest(0, qty_on_hand - r.qty), updated_at = now()
        where tenant_id = v_tenant and item_id = r.item_id and location_id = r.location_id;
      end if;
    end loop;

    delete from public.inv_serial_units
    where tenant_id = v_tenant
      and goods_receipt_line_id in (
        select ln.id from public.gr_goods_receipt_lines ln
        join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
        where gr.purchase_order_id = v_poid
      );

    delete from public.gr_goods_receipt_serials
    where goods_receipt_line_id in (
      select ln.id from public.gr_goods_receipt_lines ln
      join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
      where gr.purchase_order_id = v_poid
    );

    delete from public.gr_goods_receipt_line_lots
    where goods_receipt_line_id in (
      select ln.id from public.gr_goods_receipt_lines ln
      join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
      where gr.purchase_order_id = v_poid
    );

    delete from public.gr_goods_receipt_slip_lines
    where goods_receipt_line_id in (
      select ln.id from public.gr_goods_receipt_lines ln
      join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
      where gr.purchase_order_id = v_poid
    );

    delete from public.gr_goods_receipt_lines
    where goods_receipt_id in (select id from public.gr_goods_receipts where purchase_order_id = v_poid);

    delete from public.gr_goods_receipts where purchase_order_id = v_poid;

    update public.po_purchase_order_lines
    set received_qty = 0
    where purchase_order_id = v_poid;

    update public.po_purchase_orders
    set status = 'confirmed',
        notes = 'SEED-PO-GR-OPEN Open PO — scan 5 serials on Receive / Scan.',
        updated_at = now()
    where id = v_poid;

    -- Also ensure DEMOGR903 still has open qty (keep draft GR if present)
    select id into v_poid
    from public.po_purchase_orders
    where tenant_id = v_tenant and purchase_order_no = 'DEMOGR903';
    if v_poid is not null then
      update public.po_purchase_order_lines
      set received_qty = least(received_qty, greatest(0, qty - 1))
      where purchase_order_id = v_poid and received_qty >= qty;
      update public.po_purchase_orders
      set status = 'confirmed', updated_at = now()
      where id = v_poid and status not in ('draft', 'cancelled');
    end if;

    select coalesce(sum(qty - coalesce(received_qty, 0)), 0)::int into v_n
    from public.po_purchase_order_lines pol
    join public.po_purchase_orders po on po.id = pol.purchase_order_id
    where po.tenant_id = v_tenant and po.purchase_order_no = 'DEMOGR902';

    raise notice 'reset-demo-po-gr-open: % DEMOGR902 open_qty=%', v_code, v_n;
  end loop;
end $$;

commit;
