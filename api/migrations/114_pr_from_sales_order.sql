-- Selling -> Buying pass-down: allow a Purchase Request to be created from a Sales Order.
-- Traceability is stored via source columns on the PR (NOT via the SO slip ledger),
-- so procurement never reduces the sales-fulfillment balance of the Sales Order.
begin;

alter table public.pr_purchase_requests
  add column if not exists source_sales_order_id bigint references public.so_sales_orders(id);

alter table public.pr_purchase_request_lines
  add column if not exists source_sales_order_line_id bigint references public.so_sales_order_lines(id);

create index if not exists idx_pr_purchase_requests_source_so
  on public.pr_purchase_requests (source_sales_order_id)
  where source_sales_order_id is not null;

create index if not exists idx_pr_pr_lines_source_so_line
  on public.pr_purchase_request_lines (source_sales_order_line_id)
  where source_sales_order_line_id is not null;

-- Default doc-generation rule so the "Generate slip" menu offers Sales Order -> Purchase Request.
insert into public.doc_generation_rules (tenant_id, name, source_entity, target_entity, field_map, summarize_by, require_confirmed_source)
select t.id, 'Default SO to Purchase Request', 'sales_order', 'purchase_request', '{}'::jsonb, array['partner_id']::text[], false
from public.tenants t
on conflict do nothing;

commit;
