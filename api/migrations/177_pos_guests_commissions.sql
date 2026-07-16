-- POS guest-level discounts (F&B covers) + cart/sale line guest assignment.
begin;

alter table public.pos_cart_lines
  add column if not exists guest_no int not null default 1;

comment on column public.pos_cart_lines.guest_no is
  'Cover/guest number on the ticket (1-based). Used for per-person privilege discounts.';

alter table public.sa_sales_lines
  add column if not exists guest_no int;

create table if not exists public.pos_sale_guests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  sales_id bigint not null references public.sa_sales(id) on delete cascade,
  guest_no int not null check (guest_no >= 1),
  display_name varchar(120) not null default '',
  privilege_type text not null default 'none',
  privilege_id_no text,
  privilege_name text,
  privilege_pct numeric(8,4) not null default 0,
  share_amount numeric(18,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  net_amount numeric(18,4) not null default 0,
  vat_exempted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (sales_id, guest_no)
);

create index if not exists idx_pos_sale_guests_tenant_sale
  on public.pos_sale_guests (tenant_id, sales_id);

commit;
