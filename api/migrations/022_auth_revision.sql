-- Auth session cache invalidation across API instances (bump on permission changes).
begin;

alter table public.users
  add column if not exists auth_revision bigint not null default 0;

create index if not exists idx_users_auth_user_id_revision
  on public.users (auth_user_id, auth_revision)
  where auth_user_id is not null;

commit;
