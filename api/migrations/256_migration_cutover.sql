-- Optional cutover import: extra mapping kinds, idempotency keys, source-doc refs.
begin;

alter table public.mig_import_profiles
  drop constraint if exists mig_import_profiles_kind_check;

alter table public.mig_import_profiles
  add constraint mig_import_profiles_kind_check
  check (kind in (
    'items', 'partners', 'accounts',
    'opening_stock', 'open_si', 'open_ap', 'open_po', 'in_transit'
  ));

create table if not exists public.mig_import_keys (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  kind varchar(20) not null,
  source_doc_no varchar(120) not null,
  document_id bigint,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, source_doc_no)
);

create index if not exists idx_mig_import_keys_tenant
  on public.mig_import_keys (tenant_id, kind);

alter table public.sa_sales
  add column if not exists mig_source_doc_no varchar(120);

alter table public.fin_supplier_invoices
  add column if not exists mig_source_doc_no varchar(120);

alter table public.po_purchase_orders
  add column if not exists mig_source_doc_no varchar(120);

alter table public.inv_stock_entries
  add column if not exists mig_source_doc_no varchar(120);

commit;
