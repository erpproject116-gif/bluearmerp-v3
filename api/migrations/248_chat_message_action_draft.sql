-- Persist Baiko slash approve chips on chat messages.
begin;

alter table public.chat_messages
  add column if not exists action_draft jsonb;

commit;
