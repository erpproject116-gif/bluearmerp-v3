-- Purchase Return against goods receipt lines.
begin;

create table if not exists public.prt_purchase_returns (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  return_date date not null default current_date,
  date_seq int not null default 1,
  return_no varchar(30) not null,
  goods_receipt_id bigint references public.gr_goods_receipts(id),
  partner_id bigint not null references public.inv_partners(id),
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'submitted', 'cancelled')),
  notes text,
  grand_total numeric(18,4) not null default 0,
  submitted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, return_no)
);

create table if not exists public.prt_purchase_return_lines (
  id bigserial primary key,
  purchase_return_id bigint not null references public.prt_purchase_returns(id) on delete cascade,
  line_no int not null,
  goods_receipt_line_id bigint not null references public.gr_goods_receipt_lines(id),
  purchase_order_line_id bigint references public.po_purchase_order_lines(id),
  item_id bigint references public.inv_items(id),
  qty numeric(18,4) not null check (qty > 0),
  unit_vat_inc numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  unique (purchase_return_id, line_no)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_order.purchase_returns', 'purchase_order', 'purchase_returns', 'Purchase Returns', 50),
  ('purchase_order.purchase_returns_submit', 'purchase_order', 'purchase_returns_submit', 'Submit Purchase Return', 51)
on conflict (permission_code) do nothing;

commit;
