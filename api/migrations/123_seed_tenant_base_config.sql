-- Per-tenant currency, tax types, default location, and code sequences for new workspaces.
begin;

create or replace function public.seed_tenant_base_config(p_tenant_id bigint)
returns void
language plpgsql
as $$
begin
  insert into public.quo_currencies (tenant_id, currency_code, name, symbol, is_default, status)
  values (p_tenant_id, 'PHP', 'Philippine Peso', '₱', true, 'active')
  on conflict (tenant_id, currency_code) do nothing;

  insert into public.quo_tax_types (tenant_id, tax_code, name, tax_mode, rate_percent, sort_order, status)
  select p_tenant_id, v.tax_code, v.name, v.tax_mode, v.rate_percent, v.sort_order, 'active'
  from (
    values
      ('00001', 'Vat Included', 'included', 12::numeric, 10),
      ('00002', 'Non-VAT', 'none', 0::numeric, 20),
      ('00003', 'VAT-Inc 5%', 'included', 5::numeric, 30),
      ('00004', 'VAT-Inc 6%', 'included', 6::numeric, 40),
      ('00005', 'Vat 30%', 'excluded', 30::numeric, 50)
  ) as v(tax_code, name, tax_mode, rate_percent, sort_order)
  on conflict (tenant_id, tax_code) do nothing;

  insert into public.tenant_code_sequences (tenant_id, entity_type, last_value)
  values (p_tenant_id, 'tax_type', 5)
  on conflict (tenant_id, entity_type) do update
    set last_value = greatest(tenant_code_sequences.last_value, excluded.last_value);

  insert into public.inv_locations (
    tenant_id, location_code, location_name, location_type, production_process, status
  )
  values (p_tenant_id, '00001', 'Main', 'location', 'bundle', 'active')
  on conflict (tenant_id, location_code) do nothing;
end;
$$;

-- Backfill tenants missing default currency.
do $$
declare
  tid bigint;
begin
  for tid in select id from public.tenants
  loop
    perform public.seed_tenant_base_config(tid);
  end loop;
end;
$$;

commit;
