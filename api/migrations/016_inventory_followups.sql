-- Inventory follow-ups: repair order attachments, register repair, stock ledger reason
begin;

create table if not exists public.inv_repair_order_attachments (
  id bigserial primary key,
  repair_order_id bigint not null references public.inv_repair_orders(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_repair_order_attachments_order
  on public.inv_repair_order_attachments (repair_order_id, created_at desc);

create or replace function public.allocate_repair_registration_sequences(
  p_tenant_id bigint,
  p_registration_date date
) returns table(date_seq int, registration_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_no_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'repair_registration_date_seq', p_registration_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'repair_registration_no', p_registration_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_no_seq;

  v_prefix := to_char(p_registration_date, 'YYMMDD');

  return query select v_date_seq, (v_prefix || lpad(v_no_seq::text, 9, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_repair_registration_sequences(
  p_tenant_id bigint,
  p_registration_date date
) returns table(date_seq int, registration_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'repair_registration_date_seq' and bucket_date = p_registration_date),
      0
    ) + 1 as date_seq,
    (to_char(p_registration_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'repair_registration_no' and bucket_date = p_registration_date),
        0
      ) + 1
    )::text, 9, '0'))::varchar(15) as registration_no;
$$;

create table if not exists public.inv_repair_registrations (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  registration_date date not null,
  date_seq int not null,
  registration_no varchar(15) not null,
  partner_id bigint not null references public.inv_partners(id),
  item_id bigint references public.inv_items(id),
  item_code varchar(20) not null default '',
  item_name varchar(500) not null default '',
  serial_no varchar(255),
  issue_description text,
  status text not null default 'open'
    check (status in ('open', 'converted', 'closed')),
  repair_order_id bigint references public.inv_repair_orders(id),
  created_by_user_id bigint references public.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, registration_date, date_seq),
  unique (tenant_id, registration_no)
);

create index if not exists idx_inv_repair_registrations_list
  on public.inv_repair_registrations (tenant_id, registration_date desc)
  where deleted_at is null;

create index if not exists idx_inv_repair_registrations_status
  on public.inv_repair_registrations (tenant_id, status)
  where deleted_at is null;

alter table public.inv_stock_movements
  add column if not exists reason text;

create index if not exists idx_inv_stock_movements_list
  on public.inv_stock_movements (tenant_id, created_at desc);

create index if not exists idx_inv_stock_movements_filters
  on public.inv_stock_movements (tenant_id, item_id, location_id, movement_type, created_at desc);

commit;
