-- Phase 3: Recipe / Processing BOM type (multi-input → one FG).
begin;

alter table public.mfg_boms
  drop constraint if exists mfg_boms_bom_type_check;

alter table public.mfg_boms
  add constraint mfg_boms_bom_type_check
  check (bom_type in ('assembly', 'disassembly', 'recipe'));

commit;
