-- Finance module: official receipts, AR applications, module registry
begin;

create or replace function public.allocate_fin_receipt_sequences(
  p_tenant_id bigint,
  p_receipt_date date
) returns table(date_seq int, receipt_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'fin_receipt_date_seq', p_receipt_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'fin_receipt_no', p_receipt_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_receipt_date, 'YYMMDD');

  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_fin_receipt_sequences(
  p_tenant_id bigint,
  p_receipt_date date
) returns table(date_seq int, receipt_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'fin_receipt_date_seq' and bucket_date = p_receipt_date),
      0
    ) + 1 as date_seq,
    (to_char(p_receipt_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'fin_receipt_no' and bucket_date = p_receipt_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as receipt_no;
$$;

create table if not exists public.fin_official_receipts (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  receipt_date date not null,
  date_seq int not null,
  receipt_no varchar(15) not null,
  partner_id bigint not null references public.inv_partners(id),
  currency_id bigint not null references public.quo_currencies(id),
  payment_method text not null check (payment_method in ('cash', 'check', 'bank_transfer')),
  reference_no varchar(255),
  notes text,
  amount_total numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, receipt_date, date_seq),
  unique (tenant_id, receipt_no)
);

create index if not exists idx_fin_official_receipts_list
  on public.fin_official_receipts (tenant_id, receipt_date desc)
  where deleted_at is null;

create index if not exists idx_fin_official_receipts_partner
  on public.fin_official_receipts (tenant_id, partner_id)
  where deleted_at is null;

create table if not exists public.fin_receipt_applications (
  id bigserial primary key,
  official_receipt_id bigint not null references public.fin_official_receipts(id) on delete cascade,
  sales_id bigint not null references public.sa_sales(id),
  applied_amount numeric(18,4) not null check (applied_amount > 0),
  unique (official_receipt_id, sales_id)
);

create index if not exists idx_fin_receipt_applications_sales
  on public.fin_receipt_applications (sales_id);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('finance', 'Finance', 'tenant', false, true, 35)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('finance', 'sales'),
  ('finance', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'finance', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
