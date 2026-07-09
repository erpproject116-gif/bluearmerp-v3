-- CRM follow-up tasks ↔ Operations Hub dual-read (legacy_crm_task_id mirror).
begin;

alter table public.wm_work_items
  add column if not exists legacy_crm_task_id bigint references public.crm_follow_up_tasks(id) on delete set null;

create unique index if not exists idx_wm_work_items_legacy_crm_task
  on public.wm_work_items (legacy_crm_task_id)
  where legacy_crm_task_id is not null;

commit;
