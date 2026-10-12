-- Carry the purchase-request line onto the RFQ so a later purchase order can slip it on confirm.
begin;

alter table public.rfq_request_lines
  add column if not exists purchase_request_line_id bigint references public.pr_purchase_request_lines(id);

create index if not exists idx_rfq_request_lines_pr_line
  on public.rfq_request_lines (purchase_request_line_id)
  where purchase_request_line_id is not null;

commit;
