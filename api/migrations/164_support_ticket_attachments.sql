-- Support ticket file attachments (images, docs, short videos). Combined size capped in API at 25 MB.
-- Parent table is public.sup_support_tickets (migration 074).
begin;

create table if not exists public.sup_support_ticket_attachments (
  id bigserial primary key,
  ticket_id bigint not null references public.sup_support_tickets(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_sup_support_ticket_attachments_ticket
  on public.sup_support_ticket_attachments (ticket_id);

commit;
