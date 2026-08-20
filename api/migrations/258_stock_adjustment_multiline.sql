-- Phase 4: multi-line stock adjustment requests + attachments.

begin;

alter table public.inv_stock_adjustment_requests
  alter column item_id drop not null,
  alter column location_id drop not null,
  alter column qty_delta drop not null;

alter table public.inv_stock_adjustment_requests
  drop constraint if exists inv_stock_adj_req_qty_nonzero;

create table if not exists public.inv_stock_adjustment_request_lines (
  id bigserial primary key,
  request_id bigint not null references public.inv_stock_adjustment_requests(id) on delete cascade,
  line_no int not null,
  item_id bigint not null references public.inv_items(id) on delete restrict,
  location_id bigint not null references public.inv_locations(id) on delete restrict,
  qty_delta numeric(18, 6) not null,
  qty_before numeric(18, 6),
  qty_after numeric(18, 6),
  created_at timestamptz not null default now(),
  constraint inv_stock_adj_line_qty_nonzero check (qty_delta <> 0),
  unique (request_id, line_no)
);

create index if not exists idx_inv_stock_adj_lines_request
  on public.inv_stock_adjustment_request_lines (request_id);

create table if not exists public.inv_stock_adjustment_request_attachments (
  id bigserial primary key,
  request_id bigint not null references public.inv_stock_adjustment_requests(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_path text not null default '',
  uploaded_by_user_id bigint references public.users(id) on delete set null,
  file_bytes bytea,
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_stock_adj_attachments_request
  on public.inv_stock_adjustment_request_attachments (request_id);

commit;
