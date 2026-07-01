-- Sales Return document (credit note against sales invoice).
begin;

create table if not exists public.sr_sales_returns (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  return_date date not null default current_date,
  date_seq int not null default 1,
  return_no varchar(30) not null,
  sales_id bigint not null references public.sa_sales(id),
  partner_id bigint not null references public.inv_partners(id),
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'submitted', 'cancelled')),
  notes text,
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  submitted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, return_no)
);

create index if not exists idx_sr_sales_returns_tenant
  on public.sr_sales_returns (tenant_id, return_date desc);

create table if not exists public.sr_sales_return_lines (
  id bigserial primary key,
  sales_return_id bigint not null references public.sr_sales_returns(id) on delete cascade,
  line_no int not null,
  sales_line_id bigint not null references public.sa_sales_lines(id),
  item_id bigint references public.inv_items(id),
  item_code varchar(20) not null default '',
  item_name varchar(500) not null default '',
  qty numeric(18,4) not null check (qty > 0),
  unit_vat_inc numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  unique (sales_return_id, line_no)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('sales.sales_returns', 'sales', 'sales_returns', 'Sales Returns', 95),
  ('sales.sales_returns_new', 'sales', 'sales_returns_new', 'New Sales Return', 96),
  ('sales.sales_returns_submit', 'sales', 'sales_returns_submit', 'Submit Sales Return', 97)
on conflict (permission_code) do nothing;

commit;
