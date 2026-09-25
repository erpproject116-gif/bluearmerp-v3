-- Let tenant owners and platform superadmins hide their profile photo from
-- everyone else (presence stack, team lists). They still see their own photo.
begin;

alter table public.users
  add column if not exists avatar_hidden_from_others boolean not null default false;

commit;
