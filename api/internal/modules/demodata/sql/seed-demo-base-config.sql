-- Per-tenant base config the demo seeds depend on: default currency, tax types,
-- and the tax_type code sequence. Mirrors migration 010 but is scoped to the
-- target demo tenant when app.demo_tenant is set (else applies to all tenants).
-- Idempotent: safe to re-run.
begin;

do $$
declare
  v_target bigint := nullif(current_setting('app.demo_tenant', true), '')::bigint;
begin
  insert into public.quo_currencies (tenant_id, currency_code, name, symbol, is_default, status)
  select t.id, 'PHP', 'Philippine Peso', '₱', true, 'active'
  from public.tenants t
  where v_target is null or t.id = v_target
  on conflict (tenant_id, currency_code) do nothing;

  insert into public.quo_tax_types (tenant_id, tax_code, name, tax_mode, rate_percent, sort_order, status)
  select t.id, v.tax_code, v.name, v.tax_mode, v.rate_percent, v.sort_order, 'active'
  from public.tenants t
  cross join (
    values
      ('00001', 'Vat Included', 'included', 12::numeric, 10),
      ('00002', 'Non-VAT', 'none', 0::numeric, 20),
      ('00003', 'VAT-Inc 5%', 'included', 5::numeric, 30),
      ('00004', 'VAT-Inc 6%', 'included', 6::numeric, 40),
      ('00005', 'Vat 30%', 'excluded', 30::numeric, 50)
  ) as v(tax_code, name, tax_mode, rate_percent, sort_order)
  where v_target is null or t.id = v_target
  on conflict (tenant_id, tax_code) do nothing;

  insert into public.tenant_code_sequences (tenant_id, entity_type, last_value)
  select t.id, 'tax_type', 5
  from public.tenants t
  where v_target is null or t.id = v_target
  on conflict (tenant_id, entity_type) do update
    set last_value = greatest(tenant_code_sequences.last_value, excluded.last_value);
end $$;

commit;
