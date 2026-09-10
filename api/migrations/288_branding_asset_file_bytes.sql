-- Persist branding logo/avatar bytes in the database so ephemeral API disks
-- (ECS redeploy, empty data/branding-assets) do not make logos "disappear".
begin;

alter table public.tenant_branding_assets
  add column if not exists file_bytes bytea;

comment on column public.tenant_branding_assets.file_bytes is
  'Optional durable copy of the image; served when storage_path file is missing.';

commit;
