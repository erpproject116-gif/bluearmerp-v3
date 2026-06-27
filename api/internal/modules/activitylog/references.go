package activitylog

// auditLogReferenceLateralSQL resolves human-readable reference numbers per target type.
const auditLogReferenceLateralSQL = `
left join lateral (
  select case al.target_type
    when 'sa_sales' then (select s.sales_no from public.sa_sales s where s.id = al.target_id and s.tenant_id = al.tenant_id limit 1)
    when 'so_sales_order' then (select so.sales_order_no from public.so_sales_orders so where so.id = al.target_id and so.tenant_id = al.tenant_id limit 1)
    when 'pr_purchase_request' then (select pr.purchase_request_no from public.pr_purchase_requests pr where pr.id = al.target_id and pr.tenant_id = al.tenant_id limit 1)
    when 'quo_quotation' then (select q.reference_no from public.quo_quotations q where q.id = al.target_id and q.tenant_id = al.tenant_id limit 1)
    when 'fin_official_receipt' then (select r.receipt_no from public.fin_official_receipts r where r.id = al.target_id and r.tenant_id = al.tenant_id limit 1)
    when 'crm_warranty_asset' then (select wa.serial_no from public.crm_warranty_assets wa where wa.id = al.target_id and wa.tenant_id = al.tenant_id limit 1)
    when 'inv_repair_order' then (select ro.repair_order_no from public.inv_repair_orders ro where ro.id = al.target_id and ro.tenant_id = al.tenant_id limit 1)
    when 'inv_repair_registration' then (select rr.registration_no from public.inv_repair_registrations rr where rr.id = al.target_id and rr.tenant_id = al.tenant_id limit 1)
    when 'inv_item' then (select i.item_code from public.inv_items i where i.id = al.target_id and i.tenant_id = al.tenant_id limit 1)
    when 'inv_partner' then (select p.partner_code from public.inv_partners p where p.id = al.target_id and p.tenant_id = al.tenant_id limit 1)
    else null
  end as reference_no
) ref on true`
