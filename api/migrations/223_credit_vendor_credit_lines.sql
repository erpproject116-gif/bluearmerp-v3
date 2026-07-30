-- Credit note and vendor credit line items (Zoho gap Phase 5).
begin;

create table if not exists public.fin_credit_note_lines (
  id bigserial primary key,
  credit_note_id bigint not null references public.fin_credit_notes(id) on delete cascade,
  line_no int not null check (line_no > 0),
  item_id bigint references public.inv_items(id) on delete set null,
  item_code varchar(50) not null default '',
  item_name varchar(255) not null default '',
  qty numeric(18,4) not null default 1 check (qty > 0),
  unit_price numeric(18,4) not null default 0 check (unit_price >= 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  amount numeric(18,4) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (credit_note_id, line_no)
);

create index if not exists idx_fin_credit_note_lines_parent
  on public.fin_credit_note_lines (credit_note_id, line_no);

create table if not exists public.fin_vendor_credit_lines (
  id bigserial primary key,
  vendor_credit_id bigint not null references public.fin_vendor_credits(id) on delete cascade,
  line_no int not null check (line_no > 0),
  item_id bigint references public.inv_items(id) on delete set null,
  item_code varchar(50) not null default '',
  item_name varchar(255) not null default '',
  qty numeric(18,4) not null default 1 check (qty > 0),
  unit_price numeric(18,4) not null default 0 check (unit_price >= 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  amount numeric(18,4) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (vendor_credit_id, line_no)
);

create index if not exists idx_fin_vendor_credit_lines_parent
  on public.fin_vendor_credit_lines (vendor_credit_id, line_no);

alter table public.fin_credit_notes
  add column if not exists source_sales_return_id bigint references public.sr_sales_returns(id) on delete set null,
  add column if not exists refund_payment_voucher_id bigint references public.fin_payment_vouchers(id) on delete set null;

commit;
