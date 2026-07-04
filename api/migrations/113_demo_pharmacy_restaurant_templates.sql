-- Activate the Pharmacy and Restaurant demo templates now that their industry
-- seed overrides (sql/pharmacy|restaurant/seed-demo-inventory.sql) exist. Idempotent.
begin;

insert into public.demo_templates (industry_code, label, description, is_active, sort_order)
values
  (
    'pharmacy',
    'Pharmacy / Drugstore',
    'Drugstore chain: themed catalog (OTC meds, vitamins, medical supplies) with the full quotation, sales order, delivery, purchasing, and finance chain plus CRM.',
    true,
    30
  ),
  (
    'restaurant',
    'Restaurant / Food Service',
    'Food service operation: themed menu + ingredient catalog with the full quotation, sales order, delivery, purchasing, and finance chain plus CRM.',
    true,
    40
  )
on conflict (industry_code) do update
  set label = excluded.label,
      description = excluded.description,
      is_active = true,
      sort_order = excluded.sort_order,
      updated_at = now();

commit;
