-- Store support ticket attachment bytes in the database so files survive
-- server restarts and redeploys (previously only written to local disk,
-- which is ephemeral on Render/Docker).
begin;

alter table public.sup_support_ticket_attachments
  add column if not exists file_bytes bytea;

commit;
