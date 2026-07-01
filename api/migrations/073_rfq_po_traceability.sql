-- RFQ to PO traceability and permissions.
begin;

alter table public.rfq_requests
  add column if not exists purchase_request_id bigint references public.pr_purchase_requests(id);

create index if not exists idx_rfq_requests_purchase_request
  on public.rfq_requests (purchase_request_id)
  where purchase_request_id is not null;

alter table public.po_purchase_orders
  add column if not exists rfq_id bigint references public.rfq_requests(id),
  add column if not exists supplier_quotation_id bigint references public.rfq_supplier_quotations(id);

create index if not exists idx_po_purchase_orders_rfq
  on public.po_purchase_orders (rfq_id)
  where rfq_id is not null;

create index if not exists idx_po_purchase_orders_supplier_quotation
  on public.po_purchase_orders (supplier_quotation_id)
  where supplier_quotation_id is not null;

alter table public.po_purchase_order_lines
  add column if not exists rfq_request_line_id bigint references public.rfq_request_lines(id),
  add column if not exists supplier_quotation_line_id bigint references public.rfq_supplier_quotation_lines(id);

create index if not exists idx_po_lines_rfq_line
  on public.po_purchase_order_lines (rfq_request_line_id)
  where rfq_request_line_id is not null;

create index if not exists idx_po_lines_supplier_quotation_line
  on public.po_purchase_order_lines (supplier_quotation_line_id)
  where supplier_quotation_line_id is not null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_order.supplier_quotations', 'purchase_order', 'supplier_quotations', 'Supplier Quotations', 52),
  ('purchase_order.supplier_quotations_create', 'purchase_order', 'supplier_quotations_create', 'Create Supplier Quotation', 53),
  ('purchase_order.purchase_orders_from_quote', 'purchase_order', 'purchase_orders_from_quote', 'Create Purchase Order from Quote', 54)
on conflict (permission_code) do nothing;

commit;
