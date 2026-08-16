-- Snapshot on-hand before/after for stock adjustment requests (From → To in the grid).

alter table public.inv_stock_adjustment_requests
  add column if not exists qty_before numeric(18, 6),
  add column if not exists qty_after numeric(18, 6);

comment on column public.inv_stock_adjustment_requests.qty_before is
  'On-hand quantity at location when the request was saved/submitted (or re-snapshotted at approve).';

comment on column public.inv_stock_adjustment_requests.qty_after is
  'Proposed (before approve) or actual (after approve) on-hand = qty_before + qty_delta.';
