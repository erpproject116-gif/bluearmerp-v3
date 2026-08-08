-- Allow Sales lines loaded from Quotation (Load Slip) to retain quotation line provenance for attachment copy.
begin;

alter table public.sa_sales_lines
  add column if not exists source_quotation_line_id bigint references public.quo_quotation_lines(id);

create index if not exists idx_sa_sales_lines_source_quotation_line
  on public.sa_sales_lines (source_quotation_line_id)
  where source_quotation_line_id is not null;

commit;
