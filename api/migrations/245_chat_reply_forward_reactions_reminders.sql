-- Team Chat v2: reply, forward, reactions, typing, reminders, sender_kind.
begin;

alter table public.chat_messages
  add column if not exists parent_message_id bigint references public.chat_messages(id) on delete set null;

alter table public.chat_messages
  add column if not exists forwarded_from_message_id bigint references public.chat_messages(id) on delete set null;

alter table public.chat_messages
  add column if not exists sender_kind varchar(20) not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_messages_sender_kind_check'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_sender_kind_check
      check (sender_kind in ('user', 'baiko', 'system'));
  end if;
end $$;

create index if not exists idx_chat_messages_parent
  on public.chat_messages (channel_id, parent_message_id, id);

create table if not exists public.chat_message_reactions (
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  emoji varchar(16) not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists idx_chat_message_reactions_message
  on public.chat_message_reactions (message_id);

create table if not exists public.chat_typing (
  channel_id bigint not null references public.chat_channels(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  primary key (channel_id, user_id)
);

create index if not exists idx_chat_typing_expires
  on public.chat_typing (expires_at);

create table if not exists public.chat_reminders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  channel_id bigint references public.chat_channels(id) on delete set null,
  created_by_user_id bigint references public.users(id) on delete set null,
  title varchar(255) not null,
  body text not null default '',
  remind_at timestamptz not null,
  status varchar(20) not null default 'scheduled'
    check (status in ('scheduled', 'fired', 'cancelled')),
  crm_task_id bigint,
  notify_channel boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_reminders_due
  on public.chat_reminders (tenant_id, remind_at)
  where status = 'scheduled';

commit;
