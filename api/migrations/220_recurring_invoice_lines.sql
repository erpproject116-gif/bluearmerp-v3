-- Recurring invoice line items (multi-line generation instead of synthetic RECUR only).
begin;

create table if not exists public.fin_recurring_invoice_lines (
  id bigserial primary key,
  recurring_invoice_id bigint not null references public.fin_recurring_invoices(id) on delete cascade,
  line_no int not null check (line_no > 0),
  item_id bigint references public.inv_items(id) on delete set null,
  item_code varchar(50) not null default '',
  item_name varchar(255) not null default '',
  qty numeric(18,4) not null default 1 check (qty > 0),
  unit_price numeric(18,4) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (recurring_invoice_id, line_no)
);

create index if not exists idx_fin_recurring_invoice_lines_parent
  on public.fin_recurring_invoice_lines (recurring_invoice_id, line_no);

commit;
