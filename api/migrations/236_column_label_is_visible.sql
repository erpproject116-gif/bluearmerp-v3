-- List column visibility defaults (tenant) alongside label overrides.
begin;

alter table public.tenant_column_label_settings
  add column if not exists is_visible boolean not null default true;

commit;
