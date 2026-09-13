-- Epic 10: owner-only recurring business email; hourly/daily off by default; BI opt-in.
begin;

alter table public.owner_change_alert_prefs
  alter column email_enabled set default false;

alter table public.owner_change_alert_prefs
  alter column digest_mode set default 'off';

alter table public.owner_change_alert_prefs
  alter column daily_ops_enabled set default false;

alter table public.owner_change_alert_prefs
  alter column weekly_bi_enabled set default false;

alter table public.owner_change_alert_prefs
  alter column monthly_bi_enabled set default false;

-- Stop repetitive owner digests for existing tenants (re-enable via prefs / SQL opt-in).
update public.owner_change_alert_prefs
set email_enabled = false,
    digest_mode = 'off',
    daily_ops_enabled = false,
    weekly_bi_enabled = false,
    monthly_bi_enabled = false,
    updated_at = now();

commit;
