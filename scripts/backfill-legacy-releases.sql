-- Optional: document legacy SO releases for tenants switching to split-mode reservation.
-- Safe to re-run. Does NOT auto-post delivery receipts or change balances.
--
-- When enabling legacy_combined_so_release = false on a tenant that already released
-- stock under combined mode, operators should either:
--   1. Leave legacy flag true until open SO lines are fulfilled, or
--   2. Manually post DR rows for historical releases (not automated here).
--
-- This script only reports release lines that have no delivery_receipt slip qty yet.

begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_count int;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select count(distinct ln.id) into v_count
    from public.so_sales_order_lines ln
    join public.so_sales_orders so on so.id = ln.sales_order_id
    left join (
      select sales_order_line_id, sum(release_qty) as released
      from public.so_sales_order_release_lines
      group by sales_order_line_id
    ) rel on rel.sales_order_line_id = ln.id
    left join (
      select sales_order_line_id, sum(qty) as delivered
      from public.so_sales_order_slip_lines
      where slip_type = 'delivery_receipt'
      group by sales_order_line_id
    ) dr on dr.sales_order_line_id = ln.id
    where so.tenant_id = v_tenant and so.deleted_at is null
      and coalesce(rel.released, 0) > 0.0001
      and (coalesce(rel.released, 0) - coalesce(dr.delivered, 0)) > 0.0001;

    raise notice 'backfill-legacy-releases [%]: % SO line(s) released but not delivered — review before disabling legacy_combined_so_release', v_code, v_count;
  end loop;
end $$;

commit;
