begin;

alter table public.pos_cart_lines
  add column if not exists serial_unit_ids bigint[] not null default '{}';

commit;
