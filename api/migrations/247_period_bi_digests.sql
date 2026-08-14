-- Weekly / monthly business intelligence email prefs.
begin;

alter table public.owner_change_alert_prefs
  add column if not exists weekly_bi_enabled boolean not null default true;

alter table public.owner_change_alert_prefs
  add column if not exists last_weekly_bi_at timestamptz;

alter table public.owner_change_alert_prefs
  add column if not exists monthly_bi_enabled boolean not null default true;

alter table public.owner_change_alert_prefs
  add column if not exists last_monthly_bi_at timestamptz;

commit;
