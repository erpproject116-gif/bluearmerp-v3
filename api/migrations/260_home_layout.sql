-- Per-user Home widget layout (Phase 5). Default remains finance + day jobs until the user customizes.

begin;

create table if not exists public.usr_home_layouts (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  widget_ids jsonb not null default '["finance","day_jobs","getting_started"]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

commit;
