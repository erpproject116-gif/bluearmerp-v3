-- Demo inventory master data — RETAIL / general merchandise industry override.
-- Same stable codes + structural attributes (partner_kind, location_type,
-- production_process, item flags/balances) as the base template, so the shared
-- transactional seed chain runs unchanged; only display names/prices are themed.
-- Idempotent: safe to re-run. Honours app.demo_tenant when set.
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
      raise warning 'seed-demo-inventory(retail): tenant % missing — skip', v_code;
      continue;
    end if;

    raise notice 'seed-demo-inventory(retail): loading inventory for % (tenant_id=%)', v_code, v_tenant;

    insert into public.inv_partners (tenant_id, partner_code, partner_kind, company_name, ceo_name, phone, mobile, email, address, status) values
      (v_tenant, '00001', 'customer', 'Metro Grocery Chain Inc.', 'Elena Santos', '+632-8811-2200', '+639171234001', 'buyers.metro@example.ph', null, 'active'),
      (v_tenant, '00002', 'customer', 'Barangay Sari-Sari Collective', 'Roberto Mendoza', '+632-8848-5000', '+639182345002', 'orders.sarisari@example.ph', null, 'active'),
      (v_tenant, '00003', 'customer', 'Puregold Reseller Group', 'Carla Reyes', '+632-7908-3300', '+639193456003', 'trade.puregold@example.ph', null, 'active'),
      (v_tenant, '00004', 'vendor', 'Unilever PH Distribution', 'Miguel Tan', '+632-8370-1100', '+639204567004', 'sales@unileverdist.example.ph', null, 'active'),
      (v_tenant, '00005', 'vendor', 'Nestlé PH Trade Supply', 'Linda Cruz', '+632-8256-7700', '+639215678005', 'orders@nestletrade.example.ph', null, 'active'),
      (v_tenant, '00006', 'vendor', 'San Miguel Foods Trading', 'Hans Weber', '+632-8842-9900', '+639226789006', 'ap@smfoods.example.ph', null, 'active'),
      (v_tenant, '00007', 'both', 'Cebu Wholesale Partners', 'James Ong', '+6332-231-8800', '+639337890007', 'trade@cebuwholesale.example.ph', null, 'active'),
      (v_tenant, '00008', 'customer', 'Shopwise Procurement', 'Patricia Lim', '+632-7958-4400', '+639348901008', 'procurement@shopwise.example.ph', null, 'active'),
      (v_tenant, '00009', 'vendor', 'PrimePack Carton Solutions', 'Rico Dela Cruz', '+6346-471-2200', '+639359012009', 'dispatch@primepack.example.ph', null, 'active'),
      (v_tenant, '00010', 'customer', 'Robinsons Retail Projects', 'Andrea Flores', '+632-8635-5500', '+639360123010', 'capex.robinsons@example.ph', null, 'active'),
      (v_tenant, '00011', 'both', 'Davao Goods Distributors', 'Benito Garces', '+6382-305-6600', '+639371234011', 'ops@davaogoods.example.ph', null, 'active'),
      (v_tenant, '00012', 'vendor', 'Inactive Supplier (DO NOT USE)', null, null, null, null, null, 'inactive')
    on conflict (tenant_id, partner_code) do nothing;

    insert into public.inv_locations (tenant_id, location_code, location_name, location_type, production_process, status) values
      (v_tenant, '00001', 'Head Office — Makati', 'location', 'service', 'active'),
      (v_tenant, '00002', 'Central Warehouse — Receiving', 'factory', 'bundle', 'active'),
      (v_tenant, '00003', 'Central Warehouse — Pick & Pack', 'factory', 'bundle', 'active'),
      (v_tenant, '00004', '3PL Fulfillment — Laguna', 'factory_oe_manage', 'bundle', 'active'),
      (v_tenant, '00005', '3PL Fulfillment — Batangas', 'factory_oe_manage', 'bundle', 'active'),
      (v_tenant, '00006', 'Cebu Branch Store', 'location', 'service', 'active'),
      (v_tenant, '00007', 'Mobile Delivery Fleet (NCR)', 'location', 'service', 'active'),
      (v_tenant, '00008', 'Closed — Cavite Depot', 'factory', 'bundle', 'inactive')
    on conflict (tenant_id, location_code) do nothing;

    insert into public.inv_projects (tenant_id, project_code, project_name, status) values
      (v_tenant, '00001', 'SM North EDSA — Holiday Endcap 2026', 'active'),
      (v_tenant, '00002', 'Ayala Malls — Back-to-School Push', 'active'),
      (v_tenant, '00003', 'Vista Mall — New Branch Opening', 'active'),
      (v_tenant, '00004', 'Export — FOB Singapore Consolidation', 'active'),
      (v_tenant, '00005', 'Seda Hotels — Amenities Supply Phase 1', 'active'),
      (v_tenant, '00006', 'Robinsons Galleria — Seasonal Display', 'active'),
      (v_tenant, '00007', 'Cancelled — Ortigas Pop-Up 2025', 'inactive')
    on conflict (tenant_id, project_code) do nothing;

    insert into public.inv_departments (tenant_id, department_code, department_name, status) values
      (v_tenant, '00001', 'Merchandising', 'active'),
      (v_tenant, '00002', 'Receiving & Warehousing', 'active'),
      (v_tenant, '00003', 'Store Operations', 'active'),
      (v_tenant, '00004', 'Pricing & Promotions', 'active'),
      (v_tenant, '00005', 'Loss Prevention & QC', 'active'),
      (v_tenant, '00006', 'Procurement', 'active'),
      (v_tenant, '00007', 'Sales & Accounts', 'active'),
      (v_tenant, '00008', 'Legacy — R&D Lab', 'inactive')
    on conflict (tenant_id, department_code) do nothing;

    insert into public.inv_items (tenant_id, item_code, item_name, purchase_price, sales_price, vip_price, status) values
      (v_tenant, '00001', 'Bottled Water 500ml (case of 24)', 180, 300, 280, 'active'),
      (v_tenant, '00002', 'Instant Coffee 3-in-1 (pack of 30)', 150, 245, 225, 'active'),
      (v_tenant, '00003', 'Canned Sardines 155g', 18, 28, 26, 'active'),
      (v_tenant, '00004', 'Cooking Oil 1L', 78, 115, 108, 'active'),
      (v_tenant, '00005', 'Laundry Detergent Bar', 12, 22, 20, 'active'),
      (v_tenant, '00006', 'Rice — Premium 25kg Sack', 1250, 1500, 1450, 'active'),
      (v_tenant, '00007', 'Soft Drinks 1.5L', 45, 70, 65, 'active'),
      (v_tenant, '00008', 'Shampoo Sachet (box of 12)', 60, 110, 100, 'active'),
      (v_tenant, '00009', 'Powdered Milk 900g', 320, 480, 450, 'active'),
      (v_tenant, '00010', 'Delivery Service — Metro', 0, 250, 220, 'active'),
      (v_tenant, '00011', 'Freight — Provincial', 0, 800, 720, 'active'),
      (v_tenant, '00012', 'Snack Chips 100g', 22, 40, 36, 'active'),
      (v_tenant, '00013', 'Bottled Soy Sauce 1L', 35, 60, 55, 'active'),
      (v_tenant, '00014', 'Discontinued — Old Packaging SKU', 20, 0, 0, 'inactive'),
      (v_tenant, '00015', 'Promo — Clearance Bundle Box', 200, 349, 299, 'active')
    on conflict (tenant_id, item_code) do nothing;

    -- Bulk rows for pagination / cache boundary testing (idempotent via on conflict)
    insert into public.inv_partners (tenant_id, partner_code, partner_kind, company_name, ceo_name, phone, mobile, email, status)
    select
      v_tenant,
      lpad(gs::text, 5, '0'),
      (array['customer', 'vendor', 'both'])[1 + (gs % 3)],
      'Wholesale Account ' || gs,
      'Contact ' || gs,
      '+632-8' || lpad((gs % 10000)::text, 4, '0'),
      '+63917' || lpad((1000000 + gs)::text, 7, '0'),
      'partner' || gs || '@example.ph',
      case when gs % 17 = 0 then 'inactive' else 'active' end
    from generate_series(16, 120) gs
    on conflict (tenant_id, partner_code) do nothing;

    insert into public.inv_locations (tenant_id, location_code, location_name, location_type, production_process, status)
    select
      v_tenant,
      lpad(gs::text, 5, '0'),
      'Warehouse Bay ' || gs,
      (array['location', 'factory', 'factory_oe_manage'])[1 + (gs % 3)],
      (array['bundle', 'service'])[1 + (gs % 2)],
      case when gs % 19 = 0 then 'inactive' else 'active' end
    from generate_series(9, 88) gs
    on conflict (tenant_id, location_code) do nothing;

    insert into public.inv_projects (tenant_id, project_code, project_name, status)
    select
      v_tenant,
      lpad(gs::text, 5, '0'),
      'Retail Campaign ' || gs || ' — Batch ' || (2020 + (gs % 7)),
      case when gs % 23 = 0 then 'inactive' else 'active' end
    from generate_series(8, 87) gs
    on conflict (tenant_id, project_code) do nothing;

    insert into public.inv_departments (tenant_id, department_code, department_name, status)
    select
      v_tenant,
      lpad(gs::text, 5, '0'),
      'Operations Unit ' || gs,
      case when gs % 21 = 0 then 'inactive' else 'active' end
    from generate_series(9, 88) gs
    on conflict (tenant_id, department_code) do nothing;

    insert into public.inv_items (tenant_id, item_code, item_name, purchase_price, sales_price, vip_price, status)
    select
      v_tenant,
      lpad(gs::text, 5, '0'),
      'Retail SKU ' || gs || ' — Standard',
      round((gs * 37.5)::numeric, 2),
      round((gs * 62.5)::numeric, 2),
      round((gs * 55.0)::numeric, 2),
      case when gs % 25 = 0 then 'inactive' else 'active' end
    from generate_series(16, 150) gs
    on conflict (tenant_id, item_code) do nothing;

    insert into public.tenant_code_sequences (tenant_id, entity_type, last_value) values
      (v_tenant, 'partner', 120),
      (v_tenant, 'location', 88),
      (v_tenant, 'project', 87),
      (v_tenant, 'department', 88),
      (v_tenant, 'item', 150)
    on conflict (tenant_id, entity_type) do update set last_value = excluded.last_value;

    update public.inv_items set spec_name = 'Beverage', item_category = 'merchandise', item_type = 'item',
      track_inventory_qty = true
    where tenant_id = v_tenant and item_code = '00001';

    update public.inv_items set track_inventory_qty = true, default_location_id = (
      select id from public.inv_locations where tenant_id = v_tenant and location_code = '00001' limit 1
    )
    where tenant_id = v_tenant and item_code in ('00001', '00002', '00003');

    insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
    select v_tenant, i.id, l.id, case i.item_code when '00001' then 5 when '00002' then 12 when '00003' then 3 else 0 end
    from public.inv_items i
    cross join public.inv_locations l
    where i.tenant_id = v_tenant and l.tenant_id = v_tenant
      and i.item_code in ('00001', '00002', '00003')
      and l.location_code = '00001'
    on conflict (tenant_id, item_id, location_id) do update set qty_on_hand = excluded.qty_on_hand;

    insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
    select v_tenant, i.id, l.id, 2
    from public.inv_items i
    cross join public.inv_locations l
    where i.tenant_id = v_tenant and l.tenant_id = v_tenant
      and i.item_code = '00002' and l.location_code = '00002'
    on conflict (tenant_id, item_id, location_id) do update set qty_on_hand = excluded.qty_on_hand;

    insert into public.inv_repair_orders (
      tenant_id, order_date, date_seq, repair_order_no, partner_id, pic_name, location_id,
      progress_status, scheduled_completion_date, latest_update, repair_details
    )
    select
      v_tenant,
      current_date,
      1,
      to_char(current_date, 'YYMMDD') || '000000001',
      p.id,
      coalesce(u.full_name, 'Demo PIC'),
      l.id,
      'received',
      current_date + 7,
      'Sample: customer return received for inspection.',
      'Demo return/repair order seeded for QA.'
    from public.inv_partners p
    cross join public.inv_locations l
    left join public.users u on u.tenant_id = v_tenant and u.status = 'active'
    where p.tenant_id = v_tenant and p.partner_kind in ('customer', 'both')
      and l.tenant_id = v_tenant
      and not exists (select 1 from public.inv_repair_orders ro where ro.tenant_id = v_tenant)
    limit 1;

    insert into public.inv_repair_order_lines (
      repair_order_id, line_no, item_id, item_code, item_name, problem_issue, qty, remark
    )
    select ro.id, 1, i.id, i.item_code, i.item_name, 'Damaged packaging', 1, 'Demo remark on line 1'
    from public.inv_repair_orders ro
    join public.inv_items i on i.tenant_id = ro.tenant_id and i.item_code = '00001'
    where ro.tenant_id = v_tenant
      and not exists (select 1 from public.inv_repair_order_lines ln where ln.repair_order_id = ro.id and ln.line_no = 1);

    insert into public.inv_repair_order_lines (
      repair_order_id, line_no, item_id, item_code, item_name, problem_issue, qty, remark
    )
    select ro.id, 2, i.id, i.item_code, i.item_name, 'Replacement request', 1, null
    from public.inv_repair_orders ro
    join public.inv_items i on i.tenant_id = ro.tenant_id and i.item_code = '00002'
    where ro.tenant_id = v_tenant
      and not exists (select 1 from public.inv_repair_order_lines ln where ln.repair_order_id = ro.id and ln.line_no = 2);
  end loop;
end $$;

commit;
