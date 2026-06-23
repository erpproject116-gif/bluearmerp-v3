-- Tenant-scoped live presence (who is online and what screen they are on).
begin;

alter table public.users
  add column if not exists avatar_url text;

create table if not exists public.tenant_user_presence (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  current_path varchar(512) not null default '/app',
  current_label varchar(255) not null default 'Dashboard',
  activity varchar(50) not null default 'viewing',
  last_seen_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists idx_tenant_user_presence_last_seen
  on public.tenant_user_presence (tenant_id, last_seen_at desc);

commit;
