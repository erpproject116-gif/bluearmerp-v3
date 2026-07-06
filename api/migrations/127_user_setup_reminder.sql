-- Per-user setup wizard skip / reminder snooze (replaces forced redirect UX).
begin;

alter table public.users
  add column if not exists setup_wizard_skipped_at timestamptz,
  add column if not exists setup_reminder_snooze_until timestamptz;

comment on column public.users.setup_wizard_skipped_at is 'User left the setup wizard; show header reminder instead of forcing wizard.';
comment on column public.users.setup_reminder_snooze_until is 'Hide setup reminder bar until this timestamp.';

commit;
