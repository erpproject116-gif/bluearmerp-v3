-- Location Transfer fields on stock entries: PIC, project, request/approve, line remark, attachments.
begin;

alter table public.inv_stock_entries
  add column if not exists pic_user_id bigint references public.users(id) on delete set null,
  add column if not exists pic_name text,
  add column if not exists project_id bigint references public.inv_projects(id) on delete set null,
  add column if not exists project_name text,
  add column if not exists requested_by_user_id bigint references public.users(id) on delete set null,
  add column if not exists requested_at timestamptz,
  add column if not exists approved_by_user_id bigint references public.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

-- Backfill request stamps from existing create metadata.
update public.inv_stock_entries
set requested_by_user_id = coalesce(requested_by_user_id, created_by_user_id),
    requested_at = coalesce(requested_at, created_at)
where requested_by_user_id is null or requested_at is null;

update public.inv_stock_entries
set approved_by_user_id = coalesce(approved_by_user_id, created_by_user_id),
    approved_at = coalesce(approved_at, posted_at)
where status = 'posted' and (approved_by_user_id is null or approved_at is null);

alter table public.inv_stock_entry_lines
  add column if not exists remark text;

create table if not exists public.inv_stock_entry_attachments (
  id bigserial primary key,
  stock_entry_id bigint not null references public.inv_stock_entries(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_path text not null default '',
  uploaded_by_user_id bigint references public.users(id) on delete set null,
  file_bytes bytea,
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_stock_entry_attachments_entry
  on public.inv_stock_entry_attachments (stock_entry_id);

commit;
