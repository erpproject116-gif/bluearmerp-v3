-- Work item calendar reminders (offset + fire time).
alter table public.wm_work_items
  add column if not exists reminder_offset_minutes int,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

comment on column public.wm_work_items.reminder_offset_minutes is
  'Minutes before start (date+time or all-day midnight) to fire reminder; null = none.';
