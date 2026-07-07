-- Planned serial numbers on early document lines (quote/SO/PR/PO).
-- Real serial_unit_ids are captured at GR (inbound) and Sales/Release (outbound).

alter table public.quo_quotation_lines
  add column if not exists planned_serial_nos text[] not null default '{}';

alter table public.so_sales_order_lines
  add column if not exists planned_serial_nos text[] not null default '{}';

alter table public.pr_purchase_request_lines
  add column if not exists planned_serial_nos text[] not null default '{}';

alter table public.po_purchase_order_lines
  add column if not exists planned_serial_nos text[] not null default '{}';
