-- Delivery Receipt module (outbound from SO release / reservation)
begin;

create or replace function public.allocate_dr_delivery_receipt_sequences(
  p_tenant_id bigint,
  p_delivery_date date
) returns table(date_seq int, delivery_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'dr_delivery_receipt_date_seq', p_delivery_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'dr_delivery_receipt_no', p_delivery_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_delivery_date, 'YYMMDD');
  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_dr_delivery_receipt_sequences(
  p_tenant_id bigint,
  p_delivery_date date
) returns table(date_seq int, delivery_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'dr_delivery_receipt_date_seq' and bucket_date = p_delivery_date),
      0
    ) + 1 as date_seq,
    (to_char(p_delivery_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'dr_delivery_receipt_no' and bucket_date = p_delivery_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as delivery_no;
$$;

create table if not exists public.dr_delivery_receipts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  delivery_date date not null,
  date_seq int not null,
  delivery_no varchar(15) not null,
  sales_order_id bigint references public.so_sales_orders(id),
  partner_id bigint not null references public.inv_partners(id),
  location_id bigint not null references public.inv_locations(id),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  notes text,
  created_by_user_id bigint references public.users(id),
  posted_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, delivery_date, date_seq),
  unique (tenant_id, delivery_no)
);

create index if not exists idx_dr_delivery_receipts_list
  on public.dr_delivery_receipts (tenant_id, delivery_date desc)
  where deleted_at is null;

create table if not exists public.dr_delivery_receipt_lines (
  id bigserial primary key,
  delivery_receipt_id bigint not null references public.dr_delivery_receipts(id) on delete cascade,
  sales_order_line_id bigint not null references public.so_sales_order_lines(id),
  sales_order_release_line_id bigint references public.so_sales_order_release_lines(id) on delete set null,
  line_no int not null,
  item_id bigint references public.inv_items(id),
  item_code varchar(15),
  item_name text,
  qty numeric(18,4) not null check (qty > 0),
  unique (delivery_receipt_id, line_no)
);

create index if not exists idx_dr_delivery_receipt_lines_so_line
  on public.dr_delivery_receipt_lines (sales_order_line_id);

-- Permissions on sales_order module (same pattern as goods receipt on purchase_order).
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('sales_order.delivery_receipts_new', 'sales_order', 'delivery_receipts_new', 'New Delivery Receipt', 175),
  ('sales_order.delivery_receipts', 'sales_order', 'delivery_receipts', 'Delivery Receipt List', 176),
  ('sales_order.delivery_receipts_post', 'sales_order', 'delivery_receipts_post', 'Post Delivery Receipt', 177)
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
  'sales_order.delivery_receipts_new',
  'sales_order.delivery_receipts',
  'sales_order.delivery_receipts_post'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'sales_order.delivery_receipts_new',
  'sales_order.delivery_receipts',
  'sales_order.delivery_receipts_post'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
