-- Go-Live-E: Migration Center boms + opening_lots import kinds.
begin;

alter table public.mig_import_profiles
  drop constraint if exists mig_import_profiles_kind_check;

alter table public.mig_import_profiles
  add constraint mig_import_profiles_kind_check
  check (kind in (
    'items', 'partners', 'accounts',
    'opening_stock', 'opening_lots', 'boms',
    'open_si', 'open_ap', 'open_po', 'in_transit',
    'open_quo', 'open_so', 'open_pr', 'open_rfq'
  ));

commit;
