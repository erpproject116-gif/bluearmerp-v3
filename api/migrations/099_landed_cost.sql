-- Import / landed cost allocation
begin;

create table if not exists public.fin_landed_cost_headers (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  goods_receipt_id bigint not null references public.gr_goods_receipts(id),
  reference text,
  status text not null default 'draft',
  total_amount numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fin_landed_cost_lines (
  id bigserial primary key,
  header_id bigint not null references public.fin_landed_cost_headers(id) on delete cascade,
  goods_receipt_line_id bigint not null references public.gr_goods_receipt_lines(id),
  cost_type text not null,
  amount numeric(18,4) not null default 0,
  allocated_unit_cost numeric(18,6) not null default 0
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.landed_cost_read', 'finance', 'landed_cost_read', 'Landed cost (read)', 86),
  ('finance.landed_cost_write', 'finance', 'landed_cost_write', 'Landed cost (write)', 87)
on conflict (permission_code) do nothing;

commit;
