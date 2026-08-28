-- Phase 2: outbound pack sessions
begin;

create table if not exists public.inv_pack_sessions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  pack_no varchar(40) not null,
  sales_order_id bigint references public.so_sales_orders(id) on delete set null,
  location_id bigint not null references public.inv_locations(id),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  notes text,
  created_by_user_id bigint references public.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pack_no)
);

create table if not exists public.inv_pack_session_lines (
  id bigserial primary key,
  pack_session_id bigint not null references public.inv_pack_sessions(id) on delete cascade,
  line_no int not null,
  item_id bigint not null references public.inv_items(id),
  container_id bigint references public.inv_containers(id) on delete set null,
  lot_batch_id bigint references public.inv_lot_batches(id) on delete set null,
  qty numeric(18,4) not null check (qty > 0),
  client_pack_id uuid,
  created_at timestamptz not null default now(),
  unique (pack_session_id, line_no),
  unique (pack_session_id, client_pack_id)
);

create index if not exists idx_inv_pack_sessions_status
  on public.inv_pack_sessions (tenant_id, status, created_at desc);

commit;
