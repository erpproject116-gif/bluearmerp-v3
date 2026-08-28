-- Phase 3: disassembly BOM type and yield variance
begin;

alter table public.mfg_boms
  add column if not exists bom_type text not null default 'assembly',
  add column if not exists expected_yield_pct_min numeric(8,4),
  add column if not exists expected_yield_pct_max numeric(8,4);

alter table public.mfg_boms
  drop constraint if exists mfg_boms_bom_type_check;

alter table public.mfg_boms
  add constraint mfg_boms_bom_type_check
  check (bom_type in ('assembly', 'disassembly'));

alter table public.mfg_work_orders
  add column if not exists actual_input_qty numeric(18,4),
  add column if not exists input_lot_batch_id bigint references public.inv_lot_batches(id) on delete set null;

commit;
