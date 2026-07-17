-- Store document attachment bytes in the database.
-- Local disk is ephemeral on containerized deploys (Render): files vanished on
-- every redeploy while their DB rows survived, so downloads returned
-- "File not found". Same fix already applied to support tickets (181).

alter table public.quo_quotation_attachments
  add column if not exists file_bytes bytea;

alter table public.so_sales_order_attachments
  add column if not exists file_bytes bytea;

alter table public.sa_sales_attachments
  add column if not exists file_bytes bytea;

alter table public.po_purchase_order_attachments
  add column if not exists file_bytes bytea;

alter table public.fin_supplier_invoice_attachments
  add column if not exists file_bytes bytea;

alter table public.fin_official_receipt_attachments
  add column if not exists file_bytes bytea;

alter table public.inv_repair_order_attachments
  add column if not exists file_bytes bytea;
