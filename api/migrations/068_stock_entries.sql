-- Stock entry documents: transfer, issue, receipt.
begin;

create table if not exists public.inv_stock_entries (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entry_date date not null default current_date,
  entry_no varchar(30) not null,
  entry_type varchar(20) not null
    check (entry_type in ('transfer', 'issue', 'receipt')),
  from_location_id bigint references public.inv_locations(id),
  to_location_id bigint references public.inv_locations(id),
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  notes text,
  posted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entry_no)
);

create table if not exists public.inv_stock_entry_lines (
  id bigserial primary key,
  stock_entry_id bigint not null references public.inv_stock_entries(id) on delete cascade,
  line_no int not null,
  item_id bigint not null references public.inv_items(id),
  qty numeric(18,4) not null check (qty > 0),
  unique (stock_entry_id, line_no)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory.stock_entries', 'inventory', 'stock_entries', 'Stock Entries', 55),
  ('inventory.stock_entries_post', 'inventory', 'stock_entries_post', 'Post Stock Entry', 56)
on conflict (permission_code) do nothing;

commit;
