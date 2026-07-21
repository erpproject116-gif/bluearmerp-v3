-- BOM output UoM, line UoM, scrap %, yield %.
begin;

alter table public.mfg_boms
  add column if not exists output_qty numeric(18,4);

alter table public.mfg_boms
  add column if not exists output_unit_id bigint references public.inv_units(id);

alter table public.mfg_boms
  add column if not exists yield_pct numeric(9,4);

update public.mfg_boms set output_qty = 1 where output_qty is null;
update public.mfg_boms set yield_pct = 100 where yield_pct is null;

alter table public.mfg_boms alter column output_qty set default 1;
alter table public.mfg_boms alter column output_qty set not null;
alter table public.mfg_boms alter column yield_pct set default 100;
alter table public.mfg_boms alter column yield_pct set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mfg_boms_output_qty_check'
  ) then
    alter table public.mfg_boms add constraint mfg_boms_output_qty_check check (output_qty > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'mfg_boms_yield_pct_check'
  ) then
    alter table public.mfg_boms add constraint mfg_boms_yield_pct_check check (yield_pct > 0);
  end if;
end $$;

alter table public.mfg_bom_lines
  add column if not exists unit_id bigint references public.inv_units(id);

alter table public.mfg_bom_lines
  add column if not exists scrap_pct numeric(9,4);

update public.mfg_bom_lines set scrap_pct = 0 where scrap_pct is null;
alter table public.mfg_bom_lines alter column scrap_pct set default 0;
alter table public.mfg_bom_lines alter column scrap_pct set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mfg_bom_lines_scrap_pct_check'
  ) then
    alter table public.mfg_bom_lines add constraint mfg_bom_lines_scrap_pct_check check (scrap_pct >= 0);
  end if;
end $$;

-- Backfill line unit from component base unit.
update public.mfg_bom_lines l
set unit_id = i.base_unit_id
from public.inv_items i
where l.component_item_id = i.id
  and l.unit_id is null
  and i.base_unit_id is not null;

-- Backfill BOM output unit from finished item base unit.
update public.mfg_boms b
set output_unit_id = i.base_unit_id
from public.inv_items i
where b.finished_item_id = i.id
  and b.output_unit_id is null
  and i.base_unit_id is not null;

commit;
