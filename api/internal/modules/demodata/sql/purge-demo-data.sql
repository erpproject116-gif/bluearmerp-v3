-- Purge demo transactional data for DEMO000 + BLUEARM (keeps inventory master by default).
-- Safe to re-run. Run before populate for a clean slate.
-- Does NOT delete partners, items, locations, tax types, or users.
-- Optional follow-up: purge-demo-masters.sql (soft-deletes inventory masters).
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
begin
  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise notice 'purge-demo-data: tenant % missing — skip', v_code;
      continue;
    end if;

    raise notice 'purge-demo-data: purging transactional data for % (tenant_id=%)', v_code, v_tenant;

    -- Finance AP
    delete from public.fin_payment_applications
    where payment_voucher_id in (
      select id from public.fin_payment_vouchers where tenant_id = v_tenant
    );

    delete from public.fin_payment_vouchers where tenant_id = v_tenant;

    delete from public.gr_goods_receipt_slip_lines
    where supplier_invoice_id in (
      select id from public.fin_supplier_invoices where tenant_id = v_tenant
    );

    delete from public.fin_supplier_invoice_lines
    where supplier_invoice_id in (
      select id from public.fin_supplier_invoices where tenant_id = v_tenant
    );

    delete from public.fin_supplier_invoices where tenant_id = v_tenant;

    -- Finance AR
    delete from public.fin_receipt_applications
    where official_receipt_id in (
      select id from public.fin_official_receipts where tenant_id = v_tenant
    );

    delete from public.fin_receipt_journal_lines
    where official_receipt_id in (
      select id from public.fin_official_receipts where tenant_id = v_tenant
    );

    delete from public.fin_official_receipts where tenant_id = v_tenant;

    -- Collective invoicing
    delete from public.sa_collective_invoice_sales
    where collective_invoice_id in (
      select id from public.sa_collective_invoices where tenant_id = v_tenant
    );

    delete from public.sa_collective_invoices where tenant_id = v_tenant;

    -- Serial ↔ sales links
    delete from public.inv_serial_unit_sales_lines
    where sales_line_id in (
      select ln.id from public.sa_sales_lines ln
      join public.sa_sales s on s.id = ln.sales_id
      where s.tenant_id = v_tenant
    );

    -- SO / DR slip lines
    delete from public.so_sales_order_slip_lines
    where sales_order_line_id in (
      select ln.id from public.so_sales_order_lines ln
      join public.so_sales_orders so on so.id = ln.sales_order_id
      where so.tenant_id = v_tenant
    );

    delete from public.dr_delivery_receipt_lines
    where delivery_receipt_id in (
      select id from public.dr_delivery_receipts where tenant_id = v_tenant
    );

    delete from public.dr_delivery_receipts where tenant_id = v_tenant;

    -- CRM rows that FK into sales lines / sales (must clear before sa_sales_lines)
    delete from public.crm_notifications where tenant_id = v_tenant;
    delete from public.crm_follow_up_tasks where tenant_id = v_tenant;
    delete from public.crm_warranty_assets where tenant_id = v_tenant;

    -- Sales
    delete from public.sa_sales_lines
    where sales_id in (select id from public.sa_sales where tenant_id = v_tenant);

    delete from public.sa_sales where tenant_id = v_tenant;

    -- Sales orders
    -- Clear FKs into SO headers/lines before deleting them
    update public.quo_quotation_slip_lines
    set sales_order_id = null
    where sales_order_id in (select id from public.so_sales_orders where tenant_id = v_tenant);

    update public.pr_purchase_requests
    set source_sales_order_id = null
    where tenant_id = v_tenant
      and source_sales_order_id in (select id from public.so_sales_orders where tenant_id = v_tenant);

    delete from public.sh_shipping_order_lines
    where shipping_order_id in (
      select id from public.sh_shipping_orders where tenant_id = v_tenant
    );

    delete from public.sh_shipping_orders where tenant_id = v_tenant;

    delete from public.so_sales_order_release_lines
    where sales_order_line_id in (
      select ln.id from public.so_sales_order_lines ln
      join public.so_sales_orders so on so.id = ln.sales_order_id
      where so.tenant_id = v_tenant
    );

    delete from public.so_sales_order_lines
    where sales_order_id in (select id from public.so_sales_orders where tenant_id = v_tenant);

    delete from public.so_sales_orders where tenant_id = v_tenant;

    -- Goods receipt
    delete from public.gr_goods_receipt_serials
    where goods_receipt_line_id in (
      select ln.id from public.gr_goods_receipt_lines ln
      join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
      where gr.tenant_id = v_tenant
    );

    delete from public.gr_goods_receipt_line_lots
    where goods_receipt_line_id in (
      select ln.id from public.gr_goods_receipt_lines ln
      join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
      where gr.tenant_id = v_tenant
    );

    delete from public.gr_goods_receipt_slip_lines
    where goods_receipt_line_id in (
      select ln.id from public.gr_goods_receipt_lines ln
      join public.gr_goods_receipts gr on gr.id = ln.goods_receipt_id
      where gr.tenant_id = v_tenant
    );

    delete from public.gr_goods_receipt_lines
    where goods_receipt_id in (
      select id from public.gr_goods_receipts where tenant_id = v_tenant
    );

    delete from public.gr_goods_receipts where tenant_id = v_tenant;

    -- Purchase orders
    delete from public.po_purchase_order_lines
    where purchase_order_id in (
      select id from public.po_purchase_orders where tenant_id = v_tenant
    );

    delete from public.po_purchase_orders where tenant_id = v_tenant;

    -- Purchase requests
    delete from public.pr_approvals
    where purchase_request_id in (
      select id from public.pr_purchase_requests where tenant_id = v_tenant
    );

    delete from public.pr_purchase_request_slip_lines
    where purchase_request_line_id in (
      select ln.id from public.pr_purchase_request_lines ln
      join public.pr_purchase_requests pr on pr.id = ln.purchase_request_id
      where pr.tenant_id = v_tenant
    );

    delete from public.pr_purchase_request_lines
    where purchase_request_id in (
      select id from public.pr_purchase_requests where tenant_id = v_tenant
    );

    delete from public.pr_purchase_requests where tenant_id = v_tenant;

    -- Quotations
    delete from public.quo_quotation_slip_lines
    where quotation_line_id in (
      select ln.id from public.quo_quotation_lines ln
      join public.quo_quotations q on q.id = ln.quotation_id
      where q.tenant_id = v_tenant
    );

    delete from public.quo_quotation_lines
    where quotation_id in (select id from public.quo_quotations where tenant_id = v_tenant);

    delete from public.quo_quotations where tenant_id = v_tenant;

    -- Operations Hub (before CRM tasks — wm_work_items may reference legacy_crm_task_id)
    -- CRM warranty / follow-ups / notifications already cleared above (FK into sales).
    delete from public.wm_links
    where work_item_id in (select id from public.wm_work_items where tenant_id = v_tenant);

    update public.wm_work_items set blocked_by_item_id = null where tenant_id = v_tenant;

    delete from public.wm_work_items where tenant_id = v_tenant;

    delete from public.wm_dashboard_widgets
    where dashboard_id in (select id from public.wm_dashboards where tenant_id = v_tenant);

    delete from public.wm_dashboards where tenant_id = v_tenant;
    delete from public.wm_automation_rules where tenant_id = v_tenant;

    delete from public.wm_columns
    where workspace_id in (select id from public.wm_workspaces where tenant_id = v_tenant);

    delete from public.wm_workspaces where tenant_id = v_tenant;

    delete from public.job_cost_projects
    where tenant_id = v_tenant and project_code in ('demo-riverside-reno', 'crm-follow-up');

    -- Communications demo (keep email templates — re-seeded by migration / seed-demo-comms)
    delete from public.com_thread_links
    where sent_message_id in (select id from public.com_sent_messages where tenant_id = v_tenant);

    delete from public.com_mail_messages where tenant_id = v_tenant;
    delete from public.com_sent_messages where tenant_id = v_tenant;
    delete from public.com_gmail_connections where tenant_id = v_tenant;

    -- Stock movements
    delete from public.inv_stock_movements where tenant_id = v_tenant;

    -- Serial / lot demo rows (GR receipt serials already cleared with goods receipts above)
    delete from public.inv_serial_unit_sales_lines
    where serial_unit_id in (select id from public.inv_serial_units where tenant_id = v_tenant);

    delete from public.inv_serial_events
    where serial_unit_id in (select id from public.inv_serial_units where tenant_id = v_tenant);

    delete from public.inv_serial_units where tenant_id = v_tenant;

    delete from public.inv_lot_batches where tenant_id = v_tenant;

    -- After-sales demo repair orders from seed-demo-inventory
    delete from public.inv_repair_order_lines
    where repair_order_id in (
      select id from public.inv_repair_orders where tenant_id = v_tenant
    );

    delete from public.inv_repair_orders where tenant_id = v_tenant;

    -- Reset location balances (populate re-seeds via seed-demo-inventory)
    delete from public.inv_item_location_balances where tenant_id = v_tenant;

    -- Document drafts and daily sequences
    delete from public.document_drafts where tenant_id = v_tenant;
    delete from public.tenant_daily_sequences where tenant_id = v_tenant;

    raise notice 'purge-demo-data: done for %', v_code;
  end loop;
end $$;

commit;
