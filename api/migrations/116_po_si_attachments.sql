-- Attachments for the buying chain: Purchase Order and Purchases (Supplier Invoice).
-- Mirrors the selling-chain attachment tables so files can travel PO -> Purchases.
begin;

create table if not exists public.po_purchase_order_attachments (
  id bigserial primary key,
  purchase_order_id bigint not null references public.po_purchase_orders(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_po_purchase_order_attachments_po
  on public.po_purchase_order_attachments (purchase_order_id);

create table if not exists public.fin_supplier_invoice_attachments (
  id bigserial primary key,
  supplier_invoice_id bigint not null references public.fin_supplier_invoices(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_fin_supplier_invoice_attachments_si
  on public.fin_supplier_invoice_attachments (supplier_invoice_id);

commit;
