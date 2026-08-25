-- Migration Center: Quotation, Sales Order, Purchase Request, RFQ cutover kinds.
begin;

alter table public.mig_import_profiles
  drop constraint if exists mig_import_profiles_kind_check;

alter table public.mig_import_profiles
  add constraint mig_import_profiles_kind_check
  check (kind in (
    'items', 'partners', 'accounts',
    'opening_stock', 'open_si', 'open_ap', 'open_po', 'in_transit',
    'open_quo', 'open_so', 'open_pr', 'open_rfq'
  ));

alter table public.mig_import_keys
  alter column kind type varchar(32);

alter table public.quo_quotations
  add column if not exists mig_source_doc_no varchar(120);

alter table public.so_sales_orders
  add column if not exists mig_source_doc_no varchar(120);

alter table public.pr_purchase_requests
  add column if not exists mig_source_doc_no varchar(120);

alter table public.rfq_requests
  add column if not exists mig_source_doc_no varchar(120);

create index if not exists idx_quo_quotations_mig_source
  on public.quo_quotations (tenant_id, mig_source_doc_no)
  where mig_source_doc_no is not null;

create index if not exists idx_so_sales_orders_mig_source
  on public.so_sales_orders (tenant_id, mig_source_doc_no)
  where mig_source_doc_no is not null;

create index if not exists idx_pr_purchase_requests_mig_source
  on public.pr_purchase_requests (tenant_id, mig_source_doc_no)
  where mig_source_doc_no is not null;

create index if not exists idx_rfq_requests_mig_source
  on public.rfq_requests (tenant_id, mig_source_doc_no)
  where mig_source_doc_no is not null;

commit;
