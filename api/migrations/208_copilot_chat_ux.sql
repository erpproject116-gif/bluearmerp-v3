-- Copilot chat UX: session titles + message attachments metadata.

alter table public.copilot_sessions
  add column if not exists title varchar(200) not null default '';

alter table public.copilot_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
