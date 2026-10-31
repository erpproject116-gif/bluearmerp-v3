-- Multi-endpoint outbound webhooks (replace single-row-per-tenant PK).
begin;

create table if not exists public.tenant_outbound_webhook_endpoints (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  label text not null default '',
  target_url text not null default '',
  signing_secret text not null default '',
  is_active boolean not null default false,
  event_filter jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by_user_id bigint null references public.users(id) on delete set null
);

create index if not exists idx_outbound_webhook_endpoints_tenant
  on public.tenant_outbound_webhook_endpoints (tenant_id);

insert into public.tenant_outbound_webhook_endpoints (
  tenant_id, label, target_url, signing_secret, is_active, event_filter, updated_at, updated_by_user_id
)
select
  tenant_id,
  'Default',
  coalesce(target_url, ''),
  coalesce(signing_secret, ''),
  is_active,
  coalesce(event_filter, '[]'::jsonb),
  coalesce(updated_at, now()),
  updated_by_user_id
from public.tenant_outbound_webhooks tw
where not exists (
  select 1 from public.tenant_outbound_webhook_endpoints e where e.tenant_id = tw.tenant_id
);

alter table public.tenant_outbound_webhook_deliveries
  add column if not exists endpoint_id bigint null
    references public.tenant_outbound_webhook_endpoints(id) on delete cascade;

create index if not exists idx_outbound_webhook_deliveries_endpoint
  on public.tenant_outbound_webhook_deliveries (endpoint_id);

-- Keep legacy table for rollback safety but stop using it in app code after this migration.
-- Operators may drop tenant_outbound_webhooks in a later cleanup once stable.

commit;
