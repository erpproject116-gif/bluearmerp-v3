-- Daily ops digest prefs on owner change-alert preferences.
begin;

alter table public.owner_change_alert_prefs
  add column if not exists daily_ops_enabled boolean not null default true;

alter table public.owner_change_alert_prefs
  add column if not exists last_daily_ops_at timestamptz;

commit;
