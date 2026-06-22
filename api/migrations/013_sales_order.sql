-- Sales Order module: documents, releases, stock movements, module registry
begin;

create or replace function public.allocate_sales_order_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, sales_order_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'sales_order_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'sales_order_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_order_date, 'YYMMDD');

  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_sales_order_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, sales_order_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'sales_order_date_seq' and bucket_date = p_order_date),
      0
    ) + 1 as date_seq,
    (to_char(p_order_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'sales_order_no' and bucket_date = p_order_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as sales_order_no;
$$;

create table if not exists public.so_sales_orders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  order_date date not null,
  date_seq int not null,
  sales_order_no varchar(15) not null,
  tax_type_id bigint not null references public.quo_tax_types(id),
  currency_id bigint not null references public.quo_currencies(id),
  partner_id bigint not null references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  location_id bigint not null references public.inv_locations(id),
  project_id bigint references public.inv_projects(id),
  project_name varchar(255),
  due_date date,
  delivery_date date,
  reference varchar(255),
  notes text,
  delivery_remarks text,
  payment_terms text,
  mop varchar(255),
  progress_status text not null default 'unconfirmed'
    check (progress_status in ('unconfirmed', 'in_progress', 'completed')),
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  source_quotation_id bigint references public.quo_quotations(id),
  created_by_user_id bigint references public.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_date, date_seq),
  unique (tenant_id, sales_order_no)
);

create index if not exists idx_so_sales_orders_list
  on public.so_sales_orders (tenant_id, order_date desc)
  where deleted_at is null;

create index if not exists idx_so_sales_orders_status
  on public.so_sales_orders (tenant_id, progress_status)
  where deleted_at is null;

create index if not exists idx_so_sales_orders_status_report
  on public.so_sales_orders (tenant_id, order_date, progress_status)
  where deleted_at is null;

create table if not exists public.so_sales_order_lines (
  id bigserial primary key,
  sales_order_id bigint not null references public.so_sales_orders(id) on delete cascade,
  line_no int not null,
  item_id bigint references public.inv_items(id),
  item_code varchar(20) not null default '',
  item_name varchar(500) not null default '',
  description varchar(1000),
  qty numeric(18,4) not null default 0,
  unit_non_vat numeric(18,4) not null default 0,
  non_vat_total numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  unit_vat_inc numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  remark varchar(500),
  source_quotation_line_id bigint references public.quo_quotation_lines(id),
  unique (sales_order_id, line_no)
);

create index if not exists idx_so_sales_order_lines_order
  on public.so_sales_order_lines (sales_order_id, line_no);

create table if not exists public.so_sales_order_release_lines (
  id bigserial primary key,
  sales_order_line_id bigint not null references public.so_sales_order_lines(id) on delete cascade,
  location_id bigint not null references public.inv_locations(id),
  release_date date not null default current_date,
  release_qty numeric(18,4) not null check (release_qty > 0),
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_so_release_lines_line
  on public.so_sales_order_release_lines (sales_order_line_id);

create table if not exists public.so_sales_order_attachments (
  id bigserial primary key,
  sales_order_id bigint not null references public.so_sales_orders(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.inv_stock_movements (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  item_id bigint not null references public.inv_items(id),
  location_id bigint not null references public.inv_locations(id),
  qty_delta numeric(18,4) not null,
  movement_type varchar(50) not null,
  ref_type varchar(50) not null,
  ref_id bigint not null,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_stock_movements_ref
  on public.inv_stock_movements (tenant_id, ref_type, ref_id);

alter table public.quo_quotation_slip_lines
  add column if not exists sales_order_id bigint references public.so_sales_orders(id);

create index if not exists idx_quo_slip_lines_sales_order
  on public.quo_quotation_slip_lines (sales_order_id)
  where sales_order_id is not null;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('sales_order', 'Sales Order', 'tenant', false, true, 25)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('sales_order', 'quotation'),
  ('sales_order', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'sales_order', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
