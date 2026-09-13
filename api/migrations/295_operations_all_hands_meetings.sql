-- Epic 9: owner-scheduled, tenant-wide Operations meetings.
begin;

alter table public.wm_work_items
  add column if not exists item_kind varchar(30) not null default 'task';

alter table public.wm_work_items
  add column if not exists all_hands boolean not null default false;

alter table public.wm_work_items
  add column if not exists meeting_place text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wm_work_items_item_kind_check'
      and conrelid = 'public.wm_work_items'::regclass
  ) then
    alter table public.wm_work_items
      add constraint wm_work_items_item_kind_check
      check (item_kind in ('task', 'meeting'));
  end if;
end $$;

create index if not exists idx_wm_work_items_all_hands_meetings
  on public.wm_work_items (tenant_id, start_date, start_time)
  where item_kind = 'meeting' and all_hands = true;

commit;
