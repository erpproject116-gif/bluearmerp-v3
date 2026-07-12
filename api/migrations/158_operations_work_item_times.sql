-- Timed calendar support for Operations work items.
alter table public.wm_work_items
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists all_day boolean not null default true;

-- Existing dated items stay all-day until a time is set.
update public.wm_work_items
set all_day = true
where start_time is null;
