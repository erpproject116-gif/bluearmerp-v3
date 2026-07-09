-- Sliding idle timeout: last user-initiated API activity per auth user.
begin;

create table if not exists public.auth_session_activity (
  auth_user_id uuid primary key,
  last_activity_at timestamptz not null default now()
);

create index if not exists idx_auth_session_activity_last
  on public.auth_session_activity (last_activity_at);

commit;
