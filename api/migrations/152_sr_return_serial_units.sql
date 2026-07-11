-- Sales return lines: capture which serial units are being returned.
begin;

alter table public.sr_sales_return_lines
  add column if not exists serial_unit_ids bigint[] not null default '{}';

comment on column public.sr_sales_return_lines.serial_unit_ids is 'Serial units restored to stock when this return line is submitted.';

commit;
