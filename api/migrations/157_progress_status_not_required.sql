-- Progress status always defaults in document UIs (unconfirmed / received).
-- Clear stale "required" overrides so form settings match the product default.
update public.tenant_standard_field_settings
set is_required = false, updated_at = now()
where field_key = 'progress_status'
  and entity_type in (
    'quo_quotation',
    'sa_sales',
    'so_sales_order',
    'inv_repair_order'
  )
  and is_required = true;
