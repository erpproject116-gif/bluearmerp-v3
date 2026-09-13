# Ops invites, digests, and Resend delivery

Fact-locked runbook for Platform Command invites, optional change-alert digests, and weekly/monthly BI. All API transactional mail uses `outbox.DeliverHTML` / `DeliverHTMLToMany` (Resend HTTPS first, SMTP fallback).

## What sends mail (API)

| Flow | Trigger | Recipients | Default |
|------|---------|------------|---------|
| User Management invite | Invite user in `/app/user-management/users` | Invitee | On action |
| Platform staff invite | Platform Command → staff invite (+ resend) | Invitee | On action |
| Platform tenant / owner invite | Provision workspace; **Resend invites** playbook | Pending invitees | On action |
| Hourly change-alert digest | Cron `POST .../change-alert-digest` | Tenant owner (or `CHANGE_ALERT_DIGEST_TO`) | **Off** (`email_enabled=false`, `digest_mode=off`) |
| Daily ops digest | Cron `POST .../daily-ops-digest` | Business owners only (`owner_user_id` / `owner` / `store_owner`; not `store_admin`) or override | **Off** (`daily_ops_enabled=false`) |
| Weekly BI digest | Cron `POST .../weekly-bi-digest` | Business owners only (same as daily ops) | **Opt-in** (`weekly_bi_enabled=false` until enabled) |
| Monthly BI digest | Cron `POST .../monthly-bi-digest` | Business owners only | **Opt-in** (`monthly_bi_enabled=false` until enabled) |

**In-app:** `/app/dashboard/period-summary?period=weekly|monthly` (same snapshot as the BI emails).

**Not in this pipe:** Supabase Auth confirm / reset / demo OTP (Dashboard SMTP). **Not shipped:** per-sale / per-purchase / per-SKU automatic emails (protects free Resend quota). Manual **Send email** on a sales doc (user action + `comms.send`) is unchanged.

## Env (ECS API only — not Vercel)

| Variable | Required for |
|----------|----------------|
| `RESEND_API_KEY` | Invites + digests |
| `RESEND_FROM` or `SMTP_FROM` | From address (verified domain in Resend) |
| `APP_PUBLIC_URL` | Absolute `/signin` and `/app/...` links |
| `CHANGE_ALERT_JOB_SECRET` or `CRM_JOB_SECRET` | Digest cron auth |
| `CHANGE_ALERT_DIGEST_TO` | Optional full recipient override (ops/debug); `owner` = use real owner query |
| `OPS_EMAIL_SKIP_HOURLY_DIGEST` or `CHANGE_ALERT_SKIP_HOURLY_DIGEST` | Cron no-op for hourly change-alert (even if prefs on) |
| `OPS_EMAIL_SKIP_DAILY_OPS_DIGEST` or `CHANGE_ALERT_SKIP_DAILY_OPS` | Cron no-op for daily ops |

## Cron (ECS crontab — see alibaba-deploy.md)

Recommended: **do not** schedule hourly or daily ops unless a tenant explicitly opts in via `owner_change_alert_prefs`. Schedule **one** of weekly or monthly BI (or both only when tenants opt in).

```bash
# Optional — off by default in DB; skip env is an extra kill-switch
# curl -X POST "https://api.bluearmerp.com/api/v1/platform/jobs/change-alert-digest" \
#   -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"

# curl -X POST "https://api.bluearmerp.com/api/v1/platform/jobs/daily-ops-digest" \
#   -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"

# Recurring business intelligence (owner-only; tenant must opt in)
curl -X POST "https://api.bluearmerp.com/api/v1/platform/jobs/weekly-bi-digest" \
  -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"

curl -X POST "https://api.bluearmerp.com/api/v1/platform/jobs/monthly-bi-digest" \
  -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"
```

Also keep CRM evaluate-alerts cron running so `low_stock` / `reconciliation_gap` land in the in-app bell (`crm_notifications`).

## Opt-in (SQL until UI)

```sql
-- Example: weekly BI only for tenant 42
update public.owner_change_alert_prefs
set weekly_bi_enabled = true, updated_at = now()
where tenant_id = 42;

-- Example: re-enable hourly owner activity digest
update public.owner_change_alert_prefs
set email_enabled = true, digest_mode = 'hourly', updated_at = now()
where tenant_id = 42;
```

Migration `294_epic10_owner_email_defaults.sql` sets safe defaults and clears repetitive digests for existing tenants.

## Daily ops email template

Polished HTML in `notify/formatDailyOps`: BluearmERP `#3c50e0` header (same family as invites), KPI cards by section (Today / Open pipeline / Cash / Stock & risk), amber accent on risk counts, real `/app/...` deep links, “No major movement today” when all metrics are zero, subject variants (`quiet day` / `N risk signals`), and plain-text parity.

## Weekly / monthly BI

Owner-facing intelligence built from dashboard financial-health + sales/pipeline/stock queries (`dashboard.LoadPeriodBI`):

| Cadence | Prefs | Content highlights |
|---------|-------|--------------------|
| Weekly | `weekly_bi_enabled`, `last_weekly_bi_at` | 7-day sales window, cash MTD, AR/AP, pipeline, top customers/items, risk signals |
| Monthly | `monthly_bi_enabled`, `last_monthly_bi_at` | MTD/YTD sales & cash, posted P&L when journals exist, margin by product, same risk/pipeline |

In-app: **Dashboard → Period summary** (`/app/dashboard/period-summary`).

## Smoke matrix

| # | Test | Pass |
|---|------|------|
| 1 | Platform staff invite | Resend dashboard row + inbox; Google join with exact email still works |
| 2 | Platform resend tenant invites | Pending users get mail; not only `invited_at` bump |
| 3 | User Management invite | Still works (regression) |
| 4 | `POST .../change-alert-digest` with secret | No mail when prefs off / skip env; delivers when opted in |
| 5 | `POST .../daily-ops-digest` | No mail by default; owners only when enabled |
| 6 | `POST .../weekly-bi-digest` | Mail only when `weekly_bi_enabled`; owner-only recipients |
| 7 | `POST .../monthly-bi-digest` | Mail only when `monthly_bi_enabled`; period summary monthly tab |
| 8 | Auth reset / OTP | Unchanged (Supabase Auth SMTP) |

## PO expectations (free Resend)

- **No** automatic email on every sale, purchase, zero-stock SKU, or discrepancy.
- **Yes:** in-app notification bell for near-realtime; optional owner digests and opt-in weekly/monthly BI.
- If critical stock must email more often later: paid Resend plan + a separate job — not this free-tier path.

## Related

- [`alibaba-deploy.md`](./alibaba-deploy.md) — ECS env and crontab
- [`supabase-auth-emails.md`](./supabase-auth-emails.md) — Auth SMTP templates
