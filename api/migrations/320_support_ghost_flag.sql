-- Support-only user rows stay marked after the session ends so tenant lists can hide them.
begin;

alter table public.users
  add column if not exists is_support_ghost boolean not null default false;

update public.users u
set is_support_ghost = true,
    full_name = ''
from public.platform_support_sessions s
where s.ghost_user_id = u.id
  and s.created_ghost = true
  and u.is_support_ghost = false;

commit;
