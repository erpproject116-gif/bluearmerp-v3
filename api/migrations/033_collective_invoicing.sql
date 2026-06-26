-- Collective invoicing (sales): voucher headers + linked sales
begin;

create or replace function public.allocate_collective_invoice_sequences(
  p_tenant_id bigint,
  p_invoice_date date
) returns table(date_seq int)
language plpgsql
as $$
declare
  v_date_seq int;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'collective_invoice_date_seq', p_invoice_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  return query select v_date_seq;
end;
$$;

create table if not exists public.sa_collective_invoices (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  invoice_date date not null,
  date_seq int not null,
  accounting_slip_no varchar(30),
  receivable_no varchar(255),
  partner_id bigint not null references public.inv_partners(id),
  department_id bigint references public.inv_departments(id),
  project_id bigint references public.inv_projects(id),
  pic_user_id bigint references public.users(id),
  tax_type_id bigint references public.quo_tax_types(id),
  status text not null default 'unconfirmed'
    check (status in ('unconfirmed', 'e_approval', 'confirmed', 'cancelled')),
  source text not null default 'manual'
    check (source in ('manual', 'auto_batch')),
  batch_key text,
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  due_date date,
  created_by_user_id bigint references public.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_date, date_seq)
);

create index if not exists idx_sa_collective_invoices_list
  on public.sa_collective_invoices (tenant_id, invoice_date desc);

create index if not exists idx_sa_collective_invoices_status
  on public.sa_collective_invoices (tenant_id, status);

create index if not exists idx_sa_collective_invoices_slip
  on public.sa_collective_invoices (tenant_id, accounting_slip_no)
  where accounting_slip_no is not null and btrim(accounting_slip_no) <> '';

create index if not exists idx_sa_collective_invoices_partner
  on public.sa_collective_invoices (tenant_id, partner_id);

create unique index if not exists idx_sa_collective_invoices_batch_key
  on public.sa_collective_invoices (tenant_id, batch_key)
  where batch_key is not null and status <> 'cancelled';

create table if not exists public.sa_collective_invoice_sales (
  collective_invoice_id bigint not null references public.sa_collective_invoices(id) on delete cascade,
  sales_id bigint not null references public.sa_sales(id) on delete restrict,
  sort_order int not null default 1,
  primary key (collective_invoice_id, sales_id),
  unique (sales_id)
);

create index if not exists idx_sa_collective_invoice_sales_invoice
  on public.sa_collective_invoice_sales (collective_invoice_id, sort_order);

commit;
