-- Selectable unit of measure on document lines (Workstream 2).
-- Lines keep their own unit; stock boundaries convert to the item base unit.
begin;

alter table public.quo_quotation_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

alter table public.so_sales_order_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

alter table public.sa_sales_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

alter table public.pr_purchase_request_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

alter table public.rfq_request_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

alter table public.rfq_supplier_quotation_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

alter table public.po_purchase_order_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

alter table public.fin_supplier_invoice_lines
  add column if not exists unit_id bigint references public.inv_units(id),
  add column if not exists unit_code varchar(30);

-- Backfill from the item base unit where the line points at an item.
do $$
declare
  t text;
begin
  foreach t in array array[
    'quo_quotation_lines',
    'so_sales_order_lines',
    'sa_sales_lines',
    'pr_purchase_request_lines',
    'rfq_request_lines',
    'rfq_supplier_quotation_lines',
    'po_purchase_order_lines',
    'fin_supplier_invoice_lines'
  ]
  loop
    execute format($f$
      update public.%I ln
      set unit_id = i.base_unit_id,
          unit_code = coalesce(u.code, nullif(trim(i.unit), ''))
      from public.inv_items i
      left join public.inv_units u on u.id = i.base_unit_id
      where ln.item_id = i.id
        and ln.unit_id is null
        and i.base_unit_id is not null
    $f$, t);
  end loop;
end $$;

create index if not exists idx_quo_quotation_lines_unit on public.quo_quotation_lines (unit_id) where unit_id is not null;
create index if not exists idx_so_sales_order_lines_unit on public.so_sales_order_lines (unit_id) where unit_id is not null;
create index if not exists idx_sa_sales_lines_unit on public.sa_sales_lines (unit_id) where unit_id is not null;
create index if not exists idx_pr_purchase_request_lines_unit on public.pr_purchase_request_lines (unit_id) where unit_id is not null;
create index if not exists idx_rfq_request_lines_unit on public.rfq_request_lines (unit_id) where unit_id is not null;
create index if not exists idx_rfq_supplier_quotation_lines_unit on public.rfq_supplier_quotation_lines (unit_id) where unit_id is not null;
create index if not exists idx_po_purchase_order_lines_unit on public.po_purchase_order_lines (unit_id) where unit_id is not null;
create index if not exists idx_fin_supplier_invoice_lines_unit on public.fin_supplier_invoice_lines (unit_id) where unit_id is not null;

commit;
