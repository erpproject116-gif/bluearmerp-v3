-- Per-tenant placeholder overrides for standard form fields.
begin;

alter table public.tenant_standard_field_settings
  add column if not exists placeholder_override varchar(255);

commit;
