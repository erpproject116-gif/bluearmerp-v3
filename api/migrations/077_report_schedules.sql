-- Scheduled report exports (stub): schedules enqueue report.scheduled_export outbox events.
begin;

create table if not exists public.report_schedules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  report_key varchar(80) not null,
  frequency varchar(20) not null default 'daily'
    check (frequency in ('daily', 'weekly', 'monthly')),
  schedule_time time not null default '06:00',
  filters jsonb not null default '{}',
  is_active boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, report_key, frequency)
);

create index if not exists idx_report_schedules_due
  on public.report_schedules (next_run_at)
  where is_active = true;

commit;
