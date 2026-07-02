-- POS operations: held orders (save bill) and cash drawer movements (cash in/out).
begin;

create table if not exists public.pos_held_orders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  session_id bigint references public.pos_sessions(id) on delete set null,
  label varchar(120) not null default '',
  order_type varchar(20) not null default 'dine_in',
  payload jsonb not null default '[]'::jsonb,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_held_orders_tenant
  on public.pos_held_orders (tenant_id, created_at desc);

create table if not exists public.pos_cash_movements (
  id bigserial primary key,
  session_id bigint not null references public.pos_sessions(id) on delete cascade,
  movement_type varchar(10) not null check (movement_type in ('in', 'out')),
  amount numeric(18,4) not null check (amount > 0),
  reason text,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_cash_movements_session
  on public.pos_cash_movements (session_id, created_at);

commit;
