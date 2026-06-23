-- Demo CRM data: item warranty/reorder, default alert rules, warranty asset backfill
-- Idempotent: safe to re-run after migration 018 and seed-demo-sales.sql
-- Run after: 018_crm.sql, seed-demo-sales.sql
begin;

update public.tenant_roles
set can_view_crm = true,
    can_manage_crm_rules = true
where role_code in ('admin', 'owner', 'manager');

do $$
declare
  v_tenant bigint;
  v_code text;
  v_item_id bigint;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-crm: tenant % missing — skip', v_code;
      continue;
    end if;

    -- Warranty + reorder on first active item (used by demo sale line)
    select id into v_item_id
    from public.inv_items
    where tenant_id = v_tenant and status = 'active' and deleted_at is null
    order by item_code
    limit 1;

    if v_item_id is not null then
      update public.inv_items
      set warranty_duration_months = 12,
          reorder_level = 10,
          updated_at = now()
      where id = v_item_id
        and (warranty_duration_months is null or warranty_duration_months = 0);
    end if;

    -- Default alert rules (idempotent)
    insert into public.crm_alert_rules (
      tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, sort_order
    ) values
      (v_tenant, 'warranty_follow_up', 'Warranty follow-up (6 months before expiry)', true, 6, 'months', 10),
      (v_tenant, 'warranty_follow_up', 'Warranty follow-up (3 months before expiry)', true, 3, 'months', 20),
      (v_tenant, 'quote_expiring', 'Quotation expiring soon', true, 7, 'days', 30),
      (v_tenant, 'low_stock', 'Low stock at reorder level', true, 0, 'days', 40),
      (v_tenant, 'quote_unconverted', 'Unconverted quotations digest', true, 30, 'days', 50)
    on conflict (tenant_id, rule_type, name) do nothing;

    -- Backfill warranty assets from demo sales with serial numbers
    insert into public.crm_warranty_assets (
      tenant_id, partner_id, item_id, item_code, item_name, serial_no,
      sales_id, sales_line_id, warranty_start, warranty_end, status,
      pic_user_id, pic_name
    )
    select
      s.tenant_id,
      s.partner_id,
      ln.item_id,
      ln.item_code,
      ln.item_name,
      trim(serial_part),
      s.id,
      ln.id,
      s.order_date,
      (s.order_date + make_interval(months => coalesce(i.warranty_duration_months, 0)))::date,
      case
        when (s.order_date + make_interval(months => coalesce(i.warranty_duration_months, 0)))::date < current_date
        then 'expired'
        else 'active'
      end,
      s.pic_user_id,
      coalesce(s.pic_name, '')
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

    raise notice 'seed-demo-crm: ensured CRM demo data for %', v_code;
  end loop;
end $$;

commit;
