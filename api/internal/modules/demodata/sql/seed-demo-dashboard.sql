-- Demo dashboard red-flag fixtures (no fake P&L)
-- Run after: migrations 047-049, seed-demo-serial-lot.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_item bigint;
  v_loc bigint;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_item from public.inv_items
    where tenant_id = v_tenant and item_code = '00002' and track_serial = true
    limit 1;

    select id into v_loc from public.inv_locations
    where tenant_id = v_tenant and location_code = '00001'
    limit 1;

    if v_item is null or v_loc is null then continue; end if;

    -- Intentional mismatch: qty_on_hand > count of in_stock/reserved serials (for red-flag demo)
    insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
    values (v_tenant, v_item, v_loc, 5)
    on conflict (tenant_id, item_id, location_id)
    do update set qty_on_hand = 5, updated_at = now();
  end loop;
end $$;

commit;
