-- Sales module: documents, SO slip linkage, module registry, activity log permission
begin;

create or replace function public.allocate_sales_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, sales_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'sales_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'sales_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_order_date, 'YYMMDD');

  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_sales_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, sales_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'sales_date_seq' and bucket_date = p_order_date),
      0
    ) + 1 as date_seq,
    (to_char(p_order_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'sales_no' and bucket_date = p_order_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as sales_no;
$$;

create table if not exists public.sa_sales (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  order_date date not null,
  date_seq int not null,
  sales_no varchar(15) not null,
  tax_type_id bigint not null references public.quo_tax_types(id),
  currency_id bigint not null references public.quo_currencies(id),
  partner_id bigint not null references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  location_id bigint not null references public.inv_locations(id),
  project_id bigint references public.inv_projects(id),
  project_name varchar(255),
  due_date date,
  terms_of_payment text check (terms_of_payment in ('30_days_terms', 'cash')),
  payment_terms text,
  si_dr_no varchar(255),
  notes text,
  progress_status text not null default 'unconfirmed'
    check (progress_status in ('unconfirmed', 'completed')),
  invoicing_status boolean not null default false,
  template_code text not null default 'default'
    check (template_code in ('default', 'non_vat', 'vat_included')),
  sales_category text check (sales_category in ('general', 'returns')),
  source_sales_order_id bigint references public.so_sales_orders(id),
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_date, date_seq),
  unique (tenant_id, sales_no)
);

create index if not exists idx_sa_sales_list
  on public.sa_sales (tenant_id, order_date desc)
  where deleted_at is null;

create index if not exists idx_sa_sales_status
  on public.sa_sales (tenant_id, progress_status)
  where deleted_at is null;

create index if not exists idx_sa_sales_invoicing
  on public.sa_sales (tenant_id, invoicing_status)
  where deleted_at is null;

create index if not exists idx_sa_sales_status_report
  on public.sa_sales (tenant_id, order_date, progress_status)
  where deleted_at is null;

create table if not exists public.sa_sales_lines (
  id bigserial primary key,
  sales_id bigint not null references public.sa_sales(id) on delete cascade,
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
  discount_amount numeric(18,4) not null default 0,
  discounted_unit_non_vat numeric(18,4) not null default 0,
  discounted_unit_vat_inc numeric(18,4) not null default 0,
  remark varchar(500),
  serial_lot_no text,
  source_sales_order_line_id bigint references public.so_sales_order_lines(id),
  unique (sales_id, line_no)
);

create index if not exists idx_sa_sales_lines_sales
  on public.sa_sales_lines (sales_id, line_no);

create table if not exists public.sa_sales_attachments (
  id bigserial primary key,
  sales_id bigint not null references public.sa_sales(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.so_sales_orders
  add column if not exists fulfillment_status text not null default 'none'
    check (fulfillment_status in ('none', 'partial', 'completed'));

create table if not exists public.so_sales_order_slip_lines (
  id bigserial primary key,
  sales_order_line_id bigint not null references public.so_sales_order_lines(id) on delete cascade,
  slip_type varchar(50) not null default 'sales',
  slip_ref varchar(100),
  slip_date_no varchar(50),
  qty numeric(18,4) not null default 0 check (qty >= 0),
  sales_id bigint references public.sa_sales(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_so_slip_lines_sales_order_line
  on public.so_sales_order_slip_lines (sales_order_line_id);

create index if not exists idx_so_slip_lines_sales
  on public.so_sales_order_slip_lines (sales_id)
  where sales_id is not null;

alter table public.tenant_roles
  add column if not exists can_view_activity_logs boolean not null default false;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('sales', 'Sales', 'tenant', false, true, 30)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('sales', 'sales_order'),
  ('sales', 'quotation'),
  ('sales', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'sales', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
