-- Role preview ("View as …") — owners/superadmins may overlay a tenant role template.
-- No behavior until API overlay is deployed; columns default null.

begin;

alter table public.users
  add column if not exists role_preview_role_code text,
  add column if not exists role_preview_home_location_id bigint
    references public.inv_locations(id) on delete set null,
  add column if not exists role_preview_started_at timestamptz,
  add column if not exists role_preview_expires_at timestamptz;

comment on column public.users.role_preview_role_code is
  'When set, auth overlay evaluates this tenant role template (read-only v1).';

create index if not exists idx_users_role_preview_active
  on public.users (tenant_id)
  where role_preview_role_code is not null;

commit;
