-- Durable outbound webhook delivery queue (enqueue on Emit; worker posts + retries).
begin;

create table if not exists public.tenant_outbound_webhook_deliveries (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  event text not null,
  body_json text not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  last_error text not null default '',
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz null
);

create index if not exists idx_outbound_webhook_deliveries_due
  on public.tenant_outbound_webhook_deliveries (status, next_attempt_at)
  where status = 'pending';

create index if not exists idx_outbound_webhook_deliveries_tenant
  on public.tenant_outbound_webhook_deliveries (tenant_id, id desc);

commit;
