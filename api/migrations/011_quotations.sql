-- Quotations document tables + daily sequences
begin;

create or replace function public.allocate_quotation_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, reference_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'quotation_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'quotation_reference_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_order_date, 'YYMMDD');

  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_quotation_sequences(
  p_tenant_id bigint,
  p_order_date date
) returns table(date_seq int, reference_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'quotation_date_seq' and bucket_date = p_order_date),
      0
    ) + 1 as date_seq,
    (to_char(p_order_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'quotation_reference_no' and bucket_date = p_order_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as reference_no;
$$;

create table if not exists public.quo_quotations (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  order_date date not null,
  date_seq int not null,
  reference_no varchar(15) not null,
  tax_type_id bigint not null references public.quo_tax_types(id),
  currency_id bigint not null references public.quo_currencies(id),
  partner_id bigint not null references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  location_id bigint not null references public.inv_locations(id),
  project_id bigint references public.inv_projects(id),
  project_name varchar(255),
  quotation_validity_text varchar(100),
  validity_days int,
  valid_until date,
  payment_terms text,
  note_for_pic_only text,
  notes text,
  progress_status text not null default 'unconfirmed'
    check (progress_status in ('unconfirmed', 'in_progress', 'completed')),
  voucher_status text not null default 'none'
    check (voucher_status in ('none', 'partial', 'completed')),
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_date, date_seq),
  unique (tenant_id, reference_no)
);

create index if not exists idx_quo_quotations_list
  on public.quo_quotations (tenant_id, order_date desc)
  where deleted_at is null;

create index if not exists idx_quo_quotations_status
  on public.quo_quotations (tenant_id, progress_status)
  where deleted_at is null;

create table if not exists public.quo_quotation_lines (
  id bigserial primary key,
  quotation_id bigint not null references public.quo_quotations(id) on delete cascade,
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
  unique (quotation_id, line_no)
);

create index if not exists idx_quo_quotation_lines_order
  on public.quo_quotation_lines (quotation_id, line_no);

create table if not exists public.quo_quotation_slip_lines (
  id bigserial primary key,
  quotation_line_id bigint not null references public.quo_quotation_lines(id) on delete cascade,
  slip_type varchar(50) not null default 'sales_order',
  slip_ref varchar(100),
  slip_date_no varchar(50),
  qty numeric(18,4) not null default 0 check (qty >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_quo_slip_lines_line
  on public.quo_quotation_slip_lines (quotation_line_id);

create table if not exists public.quo_quotation_attachments (
  id bigserial primary key,
  quotation_id bigint not null references public.quo_quotations(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_quo_quotations_status_report
  on public.quo_quotations (tenant_id, order_date, progress_status)
  where deleted_at is null;

commit;
