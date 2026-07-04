-- Activate the Retail demo template now that its industry-specific seed override
-- (sql/retail/seed-demo-inventory.sql) exists. Idempotent.
begin;

insert into public.demo_templates (industry_code, label, description, is_active, sort_order)
values (
  'retail',
  'Retail / General Merchandise',
  'Multi-branch retail store: themed catalog (groceries, household, beverages) with the full quotation, sales order, delivery, purchasing, and finance chain plus CRM.',
  true,
  20
)
on conflict (industry_code) do update
  set label = excluded.label,
      description = excluded.description,
      is_active = true,
      sort_order = excluded.sort_order,
      updated_at = now();

commit;
