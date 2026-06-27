-- Purchase Request module: documents, slip lines, module registry
begin;

create or replace function public.allocate_purchase_request_sequences(
  p_tenant_id bigint,
  p_request_date date
) returns table(date_seq int, purchase_request_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'purchase_request_date_seq', p_request_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'purchase_request_no', p_request_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_request_date, 'YYMMDD');

  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.allocate_purchase_request_no(
  p_tenant_id bigint,
  p_request_date date
) returns varchar(15)
language plpgsql
as $$
declare
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'purchase_request_no', p_request_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_request_date, 'YYMMDD');
  return (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_purchase_request_sequences(
  p_tenant_id bigint,
  p_request_date date
) returns table(date_seq int, purchase_request_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'purchase_request_date_seq' and bucket_date = p_request_date),
      0
    ) + 1 as date_seq,
    (to_char(p_request_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'purchase_request_no' and bucket_date = p_request_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as purchase_request_no;
$$;

create table if not exists public.pr_purchase_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  request_date date not null,
  date_seq int not null,
  purchase_request_no varchar(15) not null,
  tax_type_id bigint not null references public.quo_tax_types(id),
  currency_id bigint not null references public.quo_currencies(id),
  partner_id bigint references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  location_id bigint not null references public.inv_locations(id),
  project_id bigint references public.inv_projects(id),
  project_name varchar(255),
  cc text,
  domestic_foreign text not null default 'domestic'
    check (domestic_foreign in ('domestic', 'foreign')),
  send_status text not null default 'unsent'
    check (send_status in ('unsent', 'sent')),
  progress_status text not null default 'unconfirmed'
    check (progress_status in ('unconfirmed', 'e_approval', 'confirmed', 'in_progress', 'completed')),
  total_qty numeric(18,4) not null default 0,
  reference varchar(255),
  notes text,
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, request_date, date_seq),
  unique (tenant_id, purchase_request_no)
);

create index if not exists idx_pr_purchase_requests_list
  on public.pr_purchase_requests (tenant_id, request_date desc)
  where deleted_at is null;

create index if not exists idx_pr_purchase_requests_status
  on public.pr_purchase_requests (tenant_id, progress_status)
  where deleted_at is null;

create index if not exists idx_pr_purchase_requests_send
  on public.pr_purchase_requests (tenant_id, send_status)
  where deleted_at is null;

create index if not exists idx_pr_purchase_requests_status_report
  on public.pr_purchase_requests (tenant_id, request_date, progress_status)
  where deleted_at is null;

create table if not exists public.pr_purchase_request_lines (
  id bigserial primary key,
  purchase_request_id bigint not null references public.pr_purchase_requests(id) on delete cascade,
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
  input_basis text not null default 'vat_inc_unit',
  unit_non_vat numeric(18,4) not null default 0,
  non_vat_total numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  unit_vat_inc numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  remark varchar(500),
  unique (purchase_request_id, line_no)
);

create index if not exists idx_pr_purchase_request_lines_order
  on public.pr_purchase_request_lines (purchase_request_id, line_no);

create index if not exists idx_pr_purchase_request_lines_partner
  on public.pr_purchase_request_lines (partner_id)
  where partner_id is not null;

create table if not exists public.pr_purchase_request_slip_lines (
  id bigserial primary key,
  purchase_request_line_id bigint not null references public.pr_purchase_request_lines(id) on delete cascade,
  slip_type varchar(50) not null default 'purchase_order',
  slip_ref varchar(100),
  slip_date_no varchar(50),
  qty numeric(18,4) not null default 0 check (qty >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_pr_slip_lines_line
  on public.pr_purchase_request_slip_lines (purchase_request_line_id);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('purchase_request', 'Purchase Request', 'tenant', false, true, 27)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('purchase_request', 'quotation'),
  ('purchase_request', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'purchase_request', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
