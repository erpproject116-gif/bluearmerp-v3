package activitylog

// auditLogReferenceLateralSQL resolves human-readable reference numbers per target type.
const auditLogReferenceLateralSQL = `
left join lateral (
  select case al.target_type
    when 'sa_sales' then (select s.sales_no from public.sa_sales s where s.id = al.target_id and s.tenant_id = al.tenant_id limit 1)
    when 'so_sales_order' then (select so.sales_order_no from public.so_sales_orders so where so.id = al.target_id and so.tenant_id = al.tenant_id limit 1)
    when 'pr_purchase_request' then (select pr.purchase_request_no from public.pr_purchase_requests pr where pr.id = al.target_id and pr.tenant_id = al.tenant_id limit 1)
    when 'quo_quotation' then (select q.reference_no from public.quo_quotations q where q.id = al.target_id and q.tenant_id = al.tenant_id limit 1)
    when 'po_purchase_order' then (select po.purchase_order_no from public.po_purchase_orders po where po.id = al.target_id and po.tenant_id = al.tenant_id limit 1)
    when 'fin_supplier_invoice' then (select si.invoice_no from public.fin_supplier_invoices si where si.id = al.target_id and si.tenant_id = al.tenant_id limit 1)
    when 'fin_official_receipt' then (select r.receipt_no from public.fin_official_receipts r where r.id = al.target_id and r.tenant_id = al.tenant_id limit 1)
    when 'fin_payment_voucher' then (select pv.payment_no from public.fin_payment_vouchers pv where pv.id = al.target_id and pv.tenant_id = al.tenant_id limit 1)
    when 'gr_goods_receipt' then (
      select coalesce(nullif(gr.reference, ''), po.purchase_order_no)
      from public.gr_goods_receipts gr
      join public.po_purchase_orders po on po.id = gr.purchase_order_id
      where gr.id = al.target_id and gr.tenant_id = al.tenant_id limit 1)
    when 'dr_delivery_receipt' then (select dr.delivery_no from public.dr_delivery_receipts dr where dr.id = al.target_id and dr.tenant_id = al.tenant_id limit 1)
    when 'rfq_supplier_quotation' then (select sq.quote_no from public.rfq_supplier_quotations sq where sq.id = al.target_id and sq.tenant_id = al.tenant_id limit 1)
    when 'rfq_request' then (select rf.rfq_no from public.rfq_requests rf where rf.id = al.target_id and rf.tenant_id = al.tenant_id limit 1)
    when 'sr_sales_return' then (select sr.return_no from public.sr_sales_returns sr where sr.id = al.target_id and sr.tenant_id = al.tenant_id limit 1)
    when 'prt_purchase_return' then (select pr.return_no from public.prt_purchase_returns pr where pr.id = al.target_id and pr.tenant_id = al.tenant_id limit 1)
    when 'sa_collective_invoice' then (
      select coalesce(nullif(ci.receivable_no, ''), to_char(ci.invoice_date, 'MM/DD/YYYY') || '-' || ci.date_seq::text)
      from public.sa_collective_invoices ci where ci.id = al.target_id and ci.tenant_id = al.tenant_id limit 1)
    when 'crm_warranty_asset' then (select wa.serial_no from public.crm_warranty_assets wa where wa.id = al.target_id and wa.tenant_id = al.tenant_id limit 1)
    when 'inv_repair_order' then (select ro.repair_order_no from public.inv_repair_orders ro where ro.id = al.target_id and ro.tenant_id = al.tenant_id limit 1)
    when 'inv_repair_registration' then (select rr.registration_no from public.inv_repair_registrations rr where rr.id = al.target_id and rr.tenant_id = al.tenant_id limit 1)
    when 'inv_item' then (select i.item_code from public.inv_items i where i.id = al.target_id and i.tenant_id = al.tenant_id limit 1)
    when 'inv_partner' then (select p.partner_code from public.inv_partners p where p.id = al.target_id and p.tenant_id = al.tenant_id limit 1)
    when 'inv_location' then (select l.location_code from public.inv_locations l where l.id = al.target_id and l.tenant_id = al.tenant_id limit 1)
    when 'inv_project' then (select pr.project_code from public.inv_projects pr where pr.id = al.target_id and pr.tenant_id = al.tenant_id limit 1)
    when 'inv_department' then (select d.department_code from public.inv_departments d where d.id = al.target_id and d.tenant_id = al.tenant_id limit 1)
    when 'inv_stock_entry' then (select se.entry_no from public.inv_stock_entries se where se.id = al.target_id and se.tenant_id = al.tenant_id limit 1)
    when 'inv_serial_unit' then (select su.serial_no from public.inv_serial_units su where su.id = al.target_id and su.tenant_id = al.tenant_id limit 1)
    when 'inv_lot_batch' then (select lb.lot_no from public.inv_lot_batches lb where lb.id = al.target_id and lb.tenant_id = al.tenant_id limit 1)
    when 'inv_product_bundle' then (select pb.bundle_code from public.inv_product_bundles pb where pb.id = al.target_id and pb.tenant_id = al.tenant_id limit 1)
    when 'inv_price_list' then (select pl.name from public.inv_price_lists pl where pl.id = al.target_id and pl.tenant_id = al.tenant_id limit 1)
    else null
  end as reference_no
) ref on true`
