-- Carry SO delivery remarks onto Sales invoices.
alter table public.sa_sales
  add column if not exists delivery_remarks text;
