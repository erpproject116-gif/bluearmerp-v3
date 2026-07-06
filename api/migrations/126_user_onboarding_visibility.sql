-- Per-user onboarding playbook visibility (dismiss / first visit).
begin;

alter table public.users
  add column if not exists first_app_seen_at timestamptz,
  add column if not exists onboarding_playbook_dismissed_at timestamptz,
  add column if not exists onboarding_playbook_snooze_until timestamptz;

comment on column public.users.first_app_seen_at is 'Set on first onboarding/session touch; used for first-time UX.';
comment on column public.users.onboarding_playbook_dismissed_at is 'User opted out of the extended onboarding playbook banner.';
comment on column public.users.onboarding_playbook_snooze_until is 'Hide playbook banner until this timestamp (remind me later).';

commit;
