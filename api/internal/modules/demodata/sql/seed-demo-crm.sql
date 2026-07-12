-- Demo CRM data: warranty/reorder on items, low-stock balances, alert rules,
-- warranty registry, follow-up tasks, and in-app notifications.
-- Idempotent: safe to re-run after migration 018 and commercial demo seeds.
-- Run after: 018_crm.sql, seed-demo-inventory.sql, seed-demo-quotations.sql, seed-demo-sales.sql
begin;

-- CRM permissions (tenant_roles use member / store_admin from migration 012)
update public.tenant_roles
set can_view_crm = true
where role_code in ('member', 'store_admin');

update public.tenant_roles
set
  can_manage_crm_rules = true,
  can_view_all_crm = true,
  can_manage_sales_team = true,
  can_view_crm_analytics = true
where role_code = 'store_admin';

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_user_name text;
  v_loc_hq bigint;
  v_partner_sm bigint;
  v_partner_seda bigint;
  v_partner_ayala bigint;
  v_item_printer bigint;
  v_item_dining bigint;
  v_item_mattress bigint;
  v_sale_id bigint;
  v_sale_line_id bigint;
  v_q_active bigint;
  v_q_in_progress bigint;
  v_q_expired bigint;
  v_wa_active bigint;
  v_wa_expiring bigint;
  v_wa_expired bigint;
  v_rule_warranty bigint;
  v_rule_quote bigint;
  v_rule_stock bigint;
  v_d date;
begin
  v_d := current_date;

  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-crm: tenant % missing — skip', v_code;
      continue;
    end if;

    select u.id, coalesce(u.full_name, 'Demo PIC')
    into v_user_id, v_user_name
    from public.users u
    where u.tenant_id = v_tenant and u.status = 'active'
    order by u.id
    limit 1;

    select id into v_loc_hq from public.inv_locations
    where tenant_id = v_tenant and location_code = '00001' limit 1;

    select id into v_partner_sm from public.inv_partners
    where tenant_id = v_tenant and partner_code = '00001' limit 1;
    select id into v_partner_seda from public.inv_partners
    where tenant_id = v_tenant and partner_code = '00008' limit 1;
    select id into v_partner_ayala from public.inv_partners
    where tenant_id = v_tenant and partner_code = '00002' limit 1;

    select id into v_item_printer from public.inv_items
    where tenant_id = v_tenant and item_code = '00001' limit 1;
    select id into v_item_dining from public.inv_items
    where tenant_id = v_tenant and item_code = '00006' limit 1;
    select id into v_item_mattress from public.inv_items
    where tenant_id = v_tenant and item_code = '00009' limit 1;

    -- Item warranty defaults + reorder levels (CRM analytics / low-stock)
    update public.inv_items
    set warranty_duration_months = 24,
        reorder_level = 8,
        updated_at = now()
    where tenant_id = v_tenant and item_code = '00001';

    update public.inv_items
    set warranty_duration_months = 12,
        reorder_level = 20,
        updated_at = now()
    where tenant_id = v_tenant and item_code in ('00002', '00006');

    update public.inv_items
    set warranty_duration_months = 36,
        reorder_level = 5,
        updated_at = now()
    where tenant_id = v_tenant and item_code = '00009';

    -- Low stock: printer qty below reorder at HQ
    if v_loc_hq is not null and v_item_printer is not null then
      insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand, reorder_level)
      values (v_tenant, v_item_printer, v_loc_hq, 3, 8)
      on conflict (tenant_id, item_id, location_id) do update
      set qty_on_hand = 3, reorder_level = 8;
    end if;

    -- Default alert rules
    insert into public.crm_alert_rules (
      tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, sort_order
    ) values
      (v_tenant, 'warranty_follow_up', 'Warranty follow-up (6 months before expiry)', true, 6, 'months', 10),
      (v_tenant, 'warranty_follow_up', 'Warranty follow-up (3 months before expiry)', true, 3, 'months', 20),
      (v_tenant, 'quote_expiring', 'Quotation expiring soon', true, 7, 'days', 30),
      (v_tenant, 'low_stock', 'Low stock at reorder level', true, 0, 'days', 40),
      (v_tenant, 'quote_unconverted', 'Unconverted quotations digest', true, 30, 'days', 50)
    on conflict (tenant_id, rule_type, name) do nothing;

    select id into v_rule_warranty from public.crm_alert_rules
    where tenant_id = v_tenant and rule_type = 'warranty_follow_up'
      and name = 'Warranty follow-up (3 months before expiry)' limit 1;
    select id into v_rule_quote from public.crm_alert_rules
    where tenant_id = v_tenant and rule_type = 'quote_expiring' limit 1;
    select id into v_rule_stock from public.crm_alert_rules
    where tenant_id = v_tenant and rule_type = 'low_stock' limit 1;

    -- Backfill warranty assets from demo sales (serial on sale line)
    insert into public.crm_warranty_assets (
      tenant_id, partner_id, item_id, item_code, item_name, serial_no,
      sales_id, sales_line_id, warranty_start, warranty_end, status,
      pic_user_id, pic_name
    )
    select
      s.tenant_id, s.partner_id, ln.item_id, ln.item_code, ln.item_name, trim(serial_part),
      s.id, ln.id, s.order_date,
      (s.order_date + make_interval(months => coalesce(i.warranty_duration_months, 0)))::date,
      case
        when (s.order_date + make_interval(months => coalesce(i.warranty_duration_months, 0)))::date < v_d
        then 'expired' else 'active'
      end,
      s.pic_user_id, coalesce(s.pic_name, '')
    from public.sa_sales s
    join public.sa_sales_lines ln on ln.sales_id = s.id
    left join public.inv_items i on i.id = ln.item_id
    cross join lateral unnest(
      string_to_array(replace(coalesce(ln.serial_lot_no, ''), ' ', ''), ',')
    ) as serial_part
    where s.tenant_id = v_tenant
      and s.deleted_at is null
      and coalesce(ln.serial_lot_no, '') <> ''
      and coalesce(i.warranty_duration_months, 0) > 0
      and trim(serial_part) <> ''
    on conflict (tenant_id, sales_line_id, serial_no) do nothing;

    -- Extra standalone warranty assets (registry / Kanban / follow-up demos)
    if v_partner_seda is not null and v_item_printer is not null
      and not exists (
        select 1 from public.crm_warranty_assets
        where tenant_id = v_tenant and serial_no = 'DEMO-CRM-PRN-001'
      ) then
      insert into public.crm_warranty_assets (
        tenant_id, partner_id, item_id, item_code, item_name, serial_no,
        warranty_start, warranty_end, status, pic_user_id, pic_name
      ) values (
        v_tenant, v_partner_seda, v_item_printer, '00001',
        'Epson WorkForce Pro WF-C5890 A4 Colour Multifunction Printer',
        'DEMO-CRM-PRN-001',
        (v_d - interval '6 months')::date,
        (v_d - interval '6 months' + interval '24 months')::date,
        'active', v_user_id, v_user_name
      ) returning id into v_wa_active;
    end if;

    if v_partner_sm is not null and v_item_dining is not null
      and not exists (
        select 1 from public.crm_warranty_assets
        where tenant_id = v_tenant and serial_no = 'DEMO-CRM-DS-002'
      ) then
      insert into public.crm_warranty_assets (
        tenant_id, partner_id, item_id, item_code, item_name, serial_no,
        warranty_start, warranty_end, status, pic_user_id, pic_name
      ) values (
        v_tenant, v_partner_sm, v_item_dining, '00006',
        'Dining set — walnut top for SM kiosk',
        'DEMO-CRM-DS-002',
        (v_d - interval '10 months')::date,
        (v_d + interval '14 days')::date,
        'active', v_user_id, v_user_name
      ) returning id into v_wa_expiring;
    end if;

    if v_partner_ayala is not null and v_item_mattress is not null
      and not exists (
        select 1 from public.crm_warranty_assets
        where tenant_id = v_tenant and serial_no = 'DEMO-CRM-MAT-003'
      ) then
      insert into public.crm_warranty_assets (
        tenant_id, partner_id, item_id, item_code, item_name, serial_no,
        warranty_start, warranty_end, status, pic_user_id, pic_name
      ) values (
        v_tenant, v_partner_ayala, v_item_mattress, '00009',
        'Mattress pocket spring — executive lounge',
        'DEMO-CRM-MAT-003',
        (v_d - interval '40 months')::date,
        (v_d - interval '4 months')::date,
        'expired', v_user_id, v_user_name
      ) returning id into v_wa_expired;
    end if;

    select id into v_wa_active from public.crm_warranty_assets
    where tenant_id = v_tenant and serial_no = 'DEMO-CRM-PRN-001' limit 1;
    select id into v_wa_expiring from public.crm_warranty_assets
    where tenant_id = v_tenant and serial_no = 'DEMO-CRM-DS-002' limit 1;
    select id into v_wa_expired from public.crm_warranty_assets
    where tenant_id = v_tenant and serial_no = 'DEMO-CRM-MAT-003' limit 1;

    -- Link quotations for pipeline / follow-up demos
    select id into v_q_active from public.quo_quotations
    where tenant_id = v_tenant and reference_no = 'DEMOQUO001' limit 1;
    select id into v_q_in_progress from public.quo_quotations
    where tenant_id = v_tenant and reference_no = 'DEMOQUO002' limit 1;
    select id into v_q_expired from public.quo_quotations
    where tenant_id = v_tenant and reference_no = 'DEMOQUOARC' limit 1;

    -- Ensure at least one clearly expired quote for dashboard KPIs
    if v_q_expired is not null then
      update public.quo_quotations
      set valid_until = v_d - 5, updated_at = now()
      where id = v_q_expired and valid_until >= v_d;
    end if;

    select s.id, ln.id into v_sale_id, v_sale_line_id
    from public.sa_sales s
    join public.sa_sales_lines ln on ln.sales_id = s.id
    where s.tenant_id = v_tenant
      and s.sales_no = 'DEMOSI201'
      and s.deleted_at is null
    limit 1;

    -- Follow-up tasks (table + Kanban stages)
    if not exists (
      select 1 from public.crm_follow_up_tasks
      where tenant_id = v_tenant and title = '[Demo] 6-month warranty check — Seda printer'
    ) then
      insert into public.crm_follow_up_tasks (
        tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
        warranty_asset_id, title, notes, created_by_user_id
      ) values (
        v_tenant, 'warranty_follow_up', 'scheduled', v_d + 30,
        v_partner_seda, v_user_id, v_user_name, v_wa_active,
        '[Demo] 6-month warranty check — Seda printer',
        'Confirm print head condition and offer service contract renewal.',
        v_user_id
      );
    end if;

    if not exists (
      select 1 from public.crm_follow_up_tasks
      where tenant_id = v_tenant and title = '[Demo] Warranty expiring — SM dining set'
    ) then
      insert into public.crm_follow_up_tasks (
        tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
        warranty_asset_id, title, notes, created_by_user_id
      ) values (
        v_tenant, 'warranty_follow_up', 'due_soon', v_d + 3,
        v_partner_sm, v_user_id, v_user_name, v_wa_expiring,
        '[Demo] Warranty expiring — SM dining set',
        'Schedule site visit before warranty end.',
        v_user_id
      );
    end if;

    if not exists (
      select 1 from public.crm_follow_up_tasks
      where tenant_id = v_tenant and title = '[Demo] Overdue quote follow-up — SM kiosk'
    ) then
      insert into public.crm_follow_up_tasks (
        tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
        quotation_id, title, notes, created_by_user_id
      ) values (
        v_tenant, 'quote_follow_up', 'overdue', v_d - 5,
        v_partner_sm, v_user_id, v_user_name, v_q_in_progress,
        '[Demo] Overdue quote follow-up — SM kiosk',
        'Client asked for revised finishes — call procurement lead.',
        v_user_id
      );
    end if;

    if not exists (
      select 1 from public.crm_follow_up_tasks
      where tenant_id = v_tenant and title = '[Demo] Quote validity reminder — Seda'
    ) then
      insert into public.crm_follow_up_tasks (
        tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
        quotation_id, title, notes, created_by_user_id
      ) values (
        v_tenant, 'quote_follow_up', 'scheduled', v_d + 1,
        v_partner_seda, v_user_id, v_user_name, v_q_active,
        '[Demo] Quote validity reminder — Seda',
        'Quotation expires in 2 days — send reminder email draft.',
        v_user_id
      );
    end if;

    if not exists (
      select 1 from public.crm_follow_up_tasks
      where tenant_id = v_tenant and title = '[Demo] Post-sale courtesy call'
    ) then
      insert into public.crm_follow_up_tasks (
        tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
        sales_id, title, notes, created_by_user_id
      ) values (
        v_tenant, 'manual', 'scheduled', v_d + 14,
        v_partner_sm, v_user_id, v_user_name, v_sale_id,
        '[Demo] Post-sale courtesy call',
        'Check delivery satisfaction after demo SI.',
        v_user_id
      );
    end if;

    if not exists (
      select 1 from public.crm_follow_up_tasks
      where tenant_id = v_tenant and title = '[Demo] Completed warranty review'
    ) then
      insert into public.crm_follow_up_tasks (
        tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
        warranty_asset_id, title, notes, completed_at, created_by_user_id
      ) values (
        v_tenant, 'warranty_follow_up', 'completed', v_d - 7,
        v_partner_ayala, v_user_id, v_user_name, v_wa_expired,
        '[Demo] Completed warranty review',
        'Customer declined extended warranty — logged in CRM.',
        now() - interval '2 days', v_user_id
      );
    end if;

    -- In-app notifications (bell + inbox)
    insert into public.crm_notifications (
      tenant_id, user_id, rule_id, severity, title, body,
      entity_type, entity_id, dedupe_key
    ) values
      (
        v_tenant, v_user_id, v_rule_stock, 'critical',
        'Low stock: Epson printer (00001)',
        'Qty on hand (3) is below reorder level (8) at Head Office — Makati.',
        'inv_item', v_item_printer,
        v_code || ':seed:low-stock-printer'
      ),
      (
        v_tenant, v_user_id, v_rule_quote, 'warning',
        'Quotation expiring soon',
        'Quote DEMOQUO001 for Seda Hotels expires in 2 days.',
        'quo_quotation', v_q_active,
        v_code || ':seed:quote-expiring'
      ),
      (
        v_tenant, v_user_id, v_rule_warranty, 'info',
        'Warranty follow-up due',
        'Dining set serial DEMO-CRM-DS-002 warranty ends on ' || to_char(v_d + 14, 'Mon DD, YYYY') || '.',
        'crm_warranty_asset', v_wa_expiring,
        v_code || ':seed:warranty-follow-up'
      ),
      (
        v_tenant, v_user_id, v_rule_quote, 'info',
        'Unconverted quotation digest',
        '3 open quotations have not been converted to sales orders in the last 30 days.',
        null, null,
        v_code || ':seed:unconverted-digest'
      )
    on conflict (tenant_id, dedupe_key) do nothing;

    -- One read notification (for inbox read/unread mix)
    insert into public.crm_notifications (
      tenant_id, user_id, rule_id, severity, title, body,
      entity_type, entity_id, dedupe_key, read_at
    ) values (
      v_tenant, v_user_id, v_rule_warranty, 'info',
      'Warranty expired — Ayala mattress',
      'Serial DEMO-CRM-MAT-003 is past warranty. Offer paid service visit.',
      'crm_warranty_asset', v_wa_expired,
      v_code || ':seed:warranty-expired-read',
      now() - interval '1 day'
    )
    on conflict (tenant_id, dedupe_key) do nothing;

    raise notice 'seed-demo-crm: loaded CRM sample data for %', v_code;
  end loop;
end $$;

commit;
