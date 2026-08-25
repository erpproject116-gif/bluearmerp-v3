-- New items default to serial tracking. Existing rows are unchanged.
-- UI / API still send an explicit value; this covers inserts that omit the column.
alter table public.inv_items
  alter column track_serial set default true;

comment on column public.inv_items.track_serial is
  'When true, unit identity is by serial. Default true for new items; set false for services / non-serial stock.';
