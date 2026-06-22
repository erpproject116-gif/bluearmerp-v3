-- After-Sales repair orders + daily sequence allocation
begin;

create table if not exists public.tenant_daily_sequences (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  sequence_key text not null,
  bucket_date date not null,
  last_value integer not null default 0,
  primary key (tenant_id, sequence_key, bucket_date)
);

create or replace function public.allocate_repair_order_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, repair_order_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_no_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'repair_order_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'repair_order_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_no_seq;

  v_prefix := to_char(p_order_date, 'YYMMDD');

  return query select v_date_seq, (v_prefix || lpad(v_no_seq::text, 9, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_repair_order_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, repair_order_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'repair_order_date_seq' and bucket_date = p_order_date),
      0
    ) + 1 as date_seq,
    (to_char(p_order_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'repair_order_no' and bucket_date = p_order_date),
        0
      ) + 1
    )::text, 9, '0'))::varchar(15) as repair_order_no;
$$;

create table if not exists public.inv_repair_orders (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  order_date date not null,
  date_seq int not null,
  repair_order_no varchar(15) not null,
  partner_id bigint not null references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  location_id bigint not null references public.inv_locations(id),
  project_id bigint references public.inv_projects(id),
  project_name varchar(255),
  technician_name varchar(255),
  progress_status text not null default 'received'
    check (progress_status in ('received', 'finished')),
  scheduled_completion_date date,
  latest_update text,
  repair_details text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_date, date_seq),
  unique (tenant_id, repair_order_no)
);

create index if not exists idx_repair_orders_list
  on public.inv_repair_orders (tenant_id, order_date desc)
  where deleted_at is null;

create index if not exists idx_repair_orders_status
  on public.inv_repair_orders (tenant_id, progress_status)
  where deleted_at is null;

create table if not exists public.inv_repair_order_lines (
  id bigserial primary key,
  repair_order_id bigint not null references public.inv_repair_orders(id) on delete cascade,
  line_no int not null,
  item_id bigint references public.inv_items(id),
  item_code varchar(20) not null default '',
  item_name varchar(500) not null default '',
  problem_issue varchar(500),
  service_charge numeric(18,4),
  tax_type varchar(50),
  qty numeric(18,4) not null default 0,
  mop varchar(50),
  serial_lot_no varchar(255),
  unique (repair_order_id, line_no)
);

create index if not exists idx_repair_order_lines_order
  on public.inv_repair_order_lines (repair_order_id, line_no);

commit;
