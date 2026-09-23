begin;

create table if not exists public.mfg_work_order_attachments (
  id bigserial primary key,
  work_order_id bigint not null references public.mfg_work_orders(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_path text not null default '',
  uploaded_by_user_id bigint references public.users(id) on delete set null,
  file_bytes bytea,
  created_at timestamptz not null default now()
);

create index if not exists idx_mfg_work_order_attachments_wo
  on public.mfg_work_order_attachments (work_order_id);

commit;
