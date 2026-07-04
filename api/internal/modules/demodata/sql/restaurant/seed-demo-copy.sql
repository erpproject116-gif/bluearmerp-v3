-- RESTAURANT transactional copy overlay: re-theme printed narrative on seeded
-- quotations, sales, and sales orders. Idempotent. Honours app.demo_tenant.
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
      continue;
    end if;

    update public.quo_quotations set
      quotation_validity_text = '3 DAYS',
      payment_terms = '15 days',
      note_for_pic_only = 'Confirm menu costing and portion yield before catering commitment.',
      notes = E'Prices are inclusive of VAT.\nPerishable items are subject to daily market pricing and availability.\nCatering orders require advance confirmation.\nPRICES ARE SUBJECT TO CHANGE WITHOUT PRIOR NOTICE.'
    where tenant_id = v_tenant;

    update public.sa_sales set payment_terms = '15 days'
    where tenant_id = v_tenant;

    update public.so_sales_orders set payment_terms = '15 days'
    where tenant_id = v_tenant;
  end loop;
end $$;
commit;
