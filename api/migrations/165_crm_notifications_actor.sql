-- Track who caused an activity notification so the actor does not see their own bell items.
begin;

alter table public.crm_notifications
  add column if not exists actor_user_id bigint references public.users(id) on delete set null;

create index if not exists idx_crm_notifications_actor
  on public.crm_notifications (tenant_id, actor_user_id);

commit;
