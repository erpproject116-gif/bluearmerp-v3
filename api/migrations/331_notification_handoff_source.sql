-- New-document handoff rows use their own source so they are not hidden as activity info.
begin;

alter table public.crm_notifications
  drop constraint if exists crm_notifications_source_check;

alter table public.crm_notifications
  add constraint crm_notifications_source_check
  check (source in ('activity', 'rule', 'support', 'system', 'chat', 'handoff'));

commit;
