-- Finance AP: supplier invoices, payment vouchers, GR slip lines
begin;

create or replace function public.allocate_fin_supplier_invoice_sequences(
  p_tenant_id bigint,
  p_invoice_date date
) returns table(date_seq int, invoice_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'fin_supplier_invoice_date_seq', p_invoice_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'fin_supplier_invoice_no', p_invoice_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_invoice_date, 'YYMMDD');
  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_fin_supplier_invoice_sequences(
  p_tenant_id bigint,
  p_invoice_date date
) returns table(date_seq int, invoice_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'fin_supplier_invoice_date_seq' and bucket_date = p_invoice_date),
      0
    ) + 1 as date_seq,
    (to_char(p_invoice_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'fin_supplier_invoice_no' and bucket_date = p_invoice_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as invoice_no;
$$;

create or replace function public.allocate_fin_payment_voucher_sequences(
  p_tenant_id bigint,
  p_payment_date date
) returns table(date_seq int, payment_no varchar(15))
language plpgsql
as $$
declare
  v_date_seq int;
  v_ref_seq int;
  v_prefix text;
begin
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'fin_payment_voucher_date_seq', p_payment_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;

  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'fin_payment_voucher_no', p_payment_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_ref_seq;

  v_prefix := to_char(p_payment_date, 'YYMMDD');
  return query select v_date_seq, (v_prefix || lpad(v_ref_seq::text, 3, '0'))::varchar(15);
end;
$$;

create or replace function public.preview_fin_payment_voucher_sequences(
  p_tenant_id bigint,
  p_payment_date date
) returns table(date_seq int, payment_no varchar(15))
language sql
stable
as $$
  select
    coalesce(
      (select last_value from public.tenant_daily_sequences
       where tenant_id = p_tenant_id and sequence_key = 'fin_payment_voucher_date_seq' and bucket_date = p_payment_date),
      0
    ) + 1 as date_seq,
    (to_char(p_payment_date, 'YYMMDD') || lpad((
      coalesce(
        (select last_value from public.tenant_daily_sequences
         where tenant_id = p_tenant_id and sequence_key = 'fin_payment_voucher_no' and bucket_date = p_payment_date),
        0
      ) + 1
    )::text, 3, '0'))::varchar(15) as payment_no;
$$;

create table if not exists public.fin_supplier_invoices (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  invoice_date date not null,
  date_seq int not null,
  invoice_no varchar(15) not null,
  partner_id bigint not null references public.inv_partners(id),
  currency_id bigint not null references public.quo_currencies(id),
  vendor_invoice_no varchar(255),
  reference varchar(255),
  notes text,
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_date, date_seq),
  unique (tenant_id, invoice_no)
);

create index if not exists idx_fin_supplier_invoices_list
  on public.fin_supplier_invoices (tenant_id, invoice_date desc)
  where deleted_at is null;

create table if not exists public.fin_supplier_invoice_lines (
  id bigserial primary key,
  supplier_invoice_id bigint not null references public.fin_supplier_invoices(id) on delete cascade,
  line_no int not null,
  goods_receipt_line_id bigint references public.gr_goods_receipt_lines(id) on delete set null,
  purchase_order_line_id bigint references public.po_purchase_order_lines(id) on delete set null,
  item_id bigint references public.inv_items(id),
  item_code varchar(15),
  item_name text,
  qty numeric(18,4) not null check (qty > 0),
  unit_non_vat numeric(18,4) not null default 0,
  non_vat_total numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  unit_vat_inc numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  unique (supplier_invoice_id, line_no)
);

create index if not exists idx_fin_supplier_invoice_lines_gr
  on public.fin_supplier_invoice_lines (goods_receipt_line_id);

create table if not exists public.gr_goods_receipt_slip_lines (
  id bigserial primary key,
  goods_receipt_line_id bigint not null references public.gr_goods_receipt_lines(id) on delete cascade,
  slip_type text not null check (slip_type in ('supplier_invoice')),
  slip_ref varchar(255) not null,
  slip_date_no varchar(255),
  qty numeric(18,4) not null check (qty > 0),
  supplier_invoice_id bigint references public.fin_supplier_invoices(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_gr_goods_receipt_slip_lines_gr_line
  on public.gr_goods_receipt_slip_lines (goods_receipt_line_id);

create table if not exists public.fin_payment_vouchers (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  payment_date date not null,
  date_seq int not null,
  payment_no varchar(15) not null,
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
  unique (tenant_id, payment_date, date_seq),
  unique (tenant_id, payment_no)
);

create index if not exists idx_fin_payment_vouchers_list
  on public.fin_payment_vouchers (tenant_id, payment_date desc)
  where deleted_at is null;

create table if not exists public.fin_payment_applications (
  id bigserial primary key,
  payment_voucher_id bigint not null references public.fin_payment_vouchers(id) on delete cascade,
  supplier_invoice_id bigint not null references public.fin_supplier_invoices(id),
  applied_amount numeric(18,4) not null check (applied_amount > 0),
  unique (payment_voucher_id, supplier_invoice_id)
);

create index if not exists idx_fin_payment_applications_invoice
  on public.fin_payment_applications (supplier_invoice_id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.supplier_invoices_new', 'finance', 'supplier_invoices_new', 'New Supplier Invoice', 450),
  ('finance.supplier_invoices', 'finance', 'supplier_invoices', 'Supplier Invoice List', 460),
  ('finance.payment_vouchers_new', 'finance', 'payment_vouchers_new', 'New Payment Voucher', 470),
  ('finance.payment_vouchers', 'finance', 'payment_vouchers', 'Payment Voucher List', 480),
  ('finance.reports_ap_by_vendor', 'finance', 'reports_ap_by_vendor', 'A/P by Vendor', 490),
  ('finance.reports_supplier_payment_status', 'finance', 'reports_supplier_payment_status', 'Supplier Invoice Payment Status', 500)
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
  'finance.supplier_invoices_new', 'finance.supplier_invoices',
  'finance.payment_vouchers_new', 'finance.payment_vouchers',
  'finance.reports_ap_by_vendor', 'finance.reports_supplier_payment_status'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code, 'read'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in (
  'finance.supplier_invoices_new', 'finance.supplier_invoices',
  'finance.payment_vouchers_new', 'finance.payment_vouchers',
  'finance.reports_ap_by_vendor', 'finance.reports_supplier_payment_status'
)
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('finance', 'purchase_order')
on conflict do nothing;

commit;
