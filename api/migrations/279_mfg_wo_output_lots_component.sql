-- Disassembly cut outputs: stage lots per BOM component line on a work order.
begin;

alter table public.mfg_wo_output_lots
  add column if not exists component_item_id bigint references public.inv_items(id) on delete set null;

create index if not exists idx_mfg_wo_output_lots_component
  on public.mfg_wo_output_lots (work_order_id, component_item_id)
  where component_item_id is not null;

commit;
