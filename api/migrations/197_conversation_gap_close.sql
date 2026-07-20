-- Conversation gap-close: owner change-alert digests, review signatures, booking helpers.
begin;

-- Owner / product-owner change alert preferences (hourly digest by default).
create table if not exists public.owner_change_alert_prefs (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  email_enabled boolean not null default true,
  digest_mode text not null default 'hourly'
    check (digest_mode in ('hourly', 'immediate', 'off')),
  module_prefixes text[] not null default '{}',
  last_digest_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_change_alert_queue (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  action_code text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id bigint,
  actor_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  digested_at timestamptz
);

create index if not exists idx_owner_change_alert_queue_pending
  on public.owner_change_alert_queue (tenant_id, created_at)
  where digested_at is null;

-- Seed prefs for active tenants (digest on).
insert into public.owner_change_alert_prefs (tenant_id)
select t.id from public.tenants t
where t.status = 'active'
on conflict (tenant_id) do nothing;

-- Performance review wet-signature metadata.
alter table public.hr_performance_reviews
  add column if not exists signature_png bytea,
  add column if not exists signed_name text,
  add column if not exists signed_ip text;

-- POS hospitality profile flag (drives restaurant label preset on settings UI).
alter table public.pos_settings
  add column if not exists hospitality_profile text
    check (hospitality_profile is null or hospitality_profile in ('retail', 'restaurant'));

comment on column public.pos_settings.hospitality_profile is
  'Optional UX profile: restaurant emphasizes table/covers labels; retail is default.';

commit;
