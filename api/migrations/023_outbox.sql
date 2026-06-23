-- Transactional outbox for async CRM side effects (idempotent processing).
begin;

create table if not exists public.outbox_events (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  event_type varchar(80) not null,
  idempotency_key varchar(120) not null,
  payload jsonb not null,
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_outbox_pending on public.outbox_events (created_at)
  where status = 'pending';

commit;
