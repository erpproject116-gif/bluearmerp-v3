-- Purchase Order module: documents, lines, sequences
begin;

create or replace function public.allocate_purchase_order_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, purchase_order_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'purchase_order_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'purchase_order_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_order_date, 'YYMMDD');
  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_purchase_order_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, purchase_order_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'purchase_order_date_seq' and bucket_date = p_order_date),
      0
    ) + 1 as date_seq,
    (to_char(p_order_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'purchase_order_no' and bucket_date = p_order_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as purchase_order_no;
$$;

create table if not exists public.po_purchase_orders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  order_date date not null,
  date_seq int not null,
  purchase_order_no varchar(15) not null,
  purchase_request_id bigint references public.pr_purchase_requests(id),
  tax_type_id bigint not null references public.quo_tax_types(id),
  currency_id bigint not null references public.quo_currencies(id),
  partner_id bigint references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  location_id bigint not null references public.inv_locations(id),
  project_id bigint references public.inv_projects(id),
  project_name varchar(255),
  status text not null default 'draft' check (status in (
    'draft', 'confirmed', 'partially_received', 'received', 'cancelled'
  )),
  reference varchar(255),
  notes text,
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, purchase_order_no)
);

create index if not exists idx_po_purchase_orders_list
  on public.po_purchase_orders (tenant_id, order_date desc)
  where deleted_at is null;

create index if not exists idx_po_purchase_orders_pr
  on public.po_purchase_orders (purchase_request_id)
  where purchase_request_id is not null;

create table if not exists public.po_purchase_order_lines (
  id bigserial primary key,
  purchase_order_id bigint not null references public.po_purchase_orders(id) on delete cascade,
  purchase_request_line_id bigint references public.pr_purchase_request_lines(id),
  line_no int not null,
  partner_id bigint references public.inv_partners(id),
  partner_code varchar(20) not null default '',
  partner_name varchar(500) not null default '',
  item_id bigint references public.inv_items(id),
  item_code varchar(20) not null default '',
  item_name varchar(500) not null default '',
  spec_name varchar(500),
  description varchar(1000),
  qty numeric(18,4) not null default 0,
  received_qty numeric(18,4) not null default 0 check (received_qty >= 0),
  input_basis text not null default 'vat_inc_unit',
  unit_non_vat numeric(18,4) not null default 0,
  non_vat_total numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  unit_vat_inc numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  remark varchar(500),
  unique (purchase_order_id, line_no)
);

create index if not exists idx_po_purchase_order_lines_order
  on public.po_purchase_order_lines (purchase_order_id, line_no);

alter table public.inv_serial_units
  drop constraint if exists inv_serial_units_po_line_fk;

alter table public.inv_serial_units
  add constraint inv_serial_units_po_line_fk
  foreign key (purchase_order_line_id) references public.po_purchase_order_lines(id) on delete set null;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('purchase_order', 'Purchase Order', 'tenant', false, true, 28)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('purchase_order', 'purchase_request'),
  ('purchase_order', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'purchase_order', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
