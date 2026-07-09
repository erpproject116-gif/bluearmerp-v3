-- Ecount-style sales invoice holds (max 5 slots per user) for New Sales parking.
begin;

create table if not exists public.sa_sales_holds (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  hold_slot int not null check (hold_slot between 1 and 5),
  created_by_user_id bigint not null references public.users(id) on delete cascade,
  partner_id bigint references public.inv_partners(id) on delete set null,
  location_id bigint references public.inv_locations(id) on delete set null,
  customer_name text,
  amount numeric(18,4) not null default 0,
  hold_type text not null default 'sale',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, created_by_user_id, hold_slot)
);

create index if not exists idx_sa_sales_holds_tenant_user
  on public.sa_sales_holds (tenant_id, created_by_user_id);

commit;
