-- Goods Receipt module
begin;

create table if not exists public.gr_goods_receipts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  purchase_order_id bigint not null references public.po_purchase_orders(id),
  receipt_date date not null,
  location_id bigint not null references public.inv_locations(id),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  reference varchar(255),
  notes text,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gr_goods_receipts_po
  on public.gr_goods_receipts (tenant_id, purchase_order_id);

create table if not exists public.gr_goods_receipt_lines (
  id bigserial primary key,
  goods_receipt_id bigint not null references public.gr_goods_receipts(id) on delete cascade,
  purchase_order_line_id bigint not null references public.po_purchase_order_lines(id),
  line_no int not null,
  expected_qty numeric(18,4) not null default 0,
  received_qty numeric(18,4) not null default 0 check (received_qty >= 0),
  unique (goods_receipt_id, line_no)
);

create index if not exists idx_gr_goods_receipt_lines_po_line
  on public.gr_goods_receipt_lines (purchase_order_line_id);

create table if not exists public.gr_goods_receipt_serials (
  id bigserial primary key,
  goods_receipt_line_id bigint not null references public.gr_goods_receipt_lines(id) on delete cascade,
  serial_no varchar(255) not null,
  created_at timestamptz not null default now(),
  unique (goods_receipt_line_id, serial_no)
);

alter table public.inv_serial_units
  drop constraint if exists inv_serial_units_gr_line_fk;

alter table public.inv_serial_units
  add constraint inv_serial_units_gr_line_fk
  foreign key (goods_receipt_line_id) references public.gr_goods_receipt_lines(id) on delete set null;

alter table public.inv_lot_batches
  drop constraint if exists inv_lot_batches_po_line_fk;

alter table public.inv_lot_batches
  add constraint inv_lot_batches_po_line_fk
  foreign key (purchase_order_line_id) references public.po_purchase_order_lines(id) on delete set null;

alter table public.inv_lot_batches
  drop constraint if exists inv_lot_batches_gr_line_fk;

alter table public.inv_lot_batches
  add constraint inv_lot_batches_gr_line_fk
  foreign key (goods_receipt_line_id) references public.gr_goods_receipt_lines(id) on delete set null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_order.goods_receipts', 'purchase_order', 'goods_receipts', 'Goods Receipts', 340),
  ('purchase_order.goods_receipts_post', 'purchase_order', 'goods_receipts_post', 'Post Goods Receipt', 350)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'purchase_order.goods_receipts',
  'purchase_order.goods_receipts_post'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'purchase_order.goods_receipts',
  'purchase_order.goods_receipts_post'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
