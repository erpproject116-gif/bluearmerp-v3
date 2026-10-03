-- POS cash drawer: coin exchange is audited but excluded from expected_cash.
begin;

alter table public.pos_cash_movements
  drop constraint if exists pos_cash_movements_movement_type_check;

alter table public.pos_cash_movements
  add constraint pos_cash_movements_movement_type_check
  check (movement_type in ('in', 'out', 'coin_exchange'));

comment on column public.pos_cash_movements.movement_type is
  'in/out affect expected drawer cash; coin_exchange is bill↔coin swap (audited, excluded from expected_cash). No revenue JE.';

commit;
