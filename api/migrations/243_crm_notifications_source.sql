-- Tag notification producers so the inbox can filter by source.
alter table public.crm_notifications
  add column if not exists source text not null default 'activity';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_notifications_source_check'
      and conrelid = 'public.crm_notifications'::regclass
  ) then
    alter table public.crm_notifications
      add constraint crm_notifications_source_check
      check (source in ('activity', 'rule', 'support', 'system'));
  end if;
end $$;

update public.crm_notifications
set source = 'rule'
where rule_id is not null and source = 'activity';

update public.crm_notifications
set source = 'support'
where source = 'activity'
  and entity_type in (
    'support_ticket',
    'support_ticket_attachment',
    'sup_support_ticket',
    'sup_support_ticket_attachment'
  );

create index if not exists idx_crm_notifications_inbox_source
  on public.crm_notifications (tenant_id, source, read_at, created_at desc);
