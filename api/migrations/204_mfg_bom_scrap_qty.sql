-- Replace scrap % with measurable scrap/spare qty (same UoM as line qty).
begin;

alter table public.mfg_bom_lines
  add column if not exists scrap_qty numeric(18,4);

-- Preserve prior allowance: scrap_pct of qty → absolute qty.
update public.mfg_bom_lines
set scrap_qty = round(coalesce(qty, 0) * coalesce(scrap_pct, 0) / 100.0, 4)
where scrap_qty is null;

update public.mfg_bom_lines set scrap_qty = 0 where scrap_qty is null;

alter table public.mfg_bom_lines alter column scrap_qty set default 0;
alter table public.mfg_bom_lines alter column scrap_qty set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mfg_bom_lines_scrap_qty_check'
  ) then
    alter table public.mfg_bom_lines
      add constraint mfg_bom_lines_scrap_qty_check check (scrap_qty >= 0);
  end if;
end $$;

commit;
