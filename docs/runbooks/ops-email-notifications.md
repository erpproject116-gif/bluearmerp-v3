# Ops invites, digests, and Resend delivery

Fact-locked runbook for Platform Command invites, hourly change-alert digests, and the daily ops digest. All API transactional mail uses `outbox.DeliverHTML` / `DeliverHTMLToMany` (Resend HTTPS first, SMTP fallback).

## What sends mail (API)

| Flow | Trigger | Recipients | Delivery |
|------|---------|------------|----------|
| User Management invite | Invite user in `/app/user-management/users` | Invitee | Resend (async outbox drain) |
| Platform staff invite | Platform Command → staff invite (+ resend) | Invitee | Resend direct async (`platform.staff.invite`) |
| Platform tenant / owner invite | Provision workspace; **Resend invites** playbook | Pending invitees | Outbox `user.invite` + async drain |
| Hourly change-alert digest | Cron `POST .../change-alert-digest` | Tenant owner (or `CHANGE_ALERT_DIGEST_TO`) | Resend → SMTP → Gmail |
| Daily ops digest | Cron `POST .../daily-ops-digest` | Owner + active `store_admin` (or override) | Resend → SMTP |
| Weekly BI digest | Cron `POST .../weekly-bi-digest` | Owner + `store_admin` | Resend → SMTP |
| Monthly BI digest | Cron `POST .../monthly-bi-digest` | Owner + `store_admin` | Resend → SMTP |

**In-app:** `/app/dashboard/period-summary?period=weekly|monthly` (same snapshot as the emails).

**Not in this pipe:** Supabase Auth confirm / reset / demo OTP (Dashboard SMTP). **Not shipped:** per-sale / per-purchase / per-SKU emails (protects free Resend quota).

## Env (Render API only — not Vercel)

| Variable | Required for |
|----------|----------------|
| `RESEND_API_KEY` | Invites + digests on free Render |
| `RESEND_FROM` or `SMTP_FROM` | From address (verified domain in Resend) |
| `APP_PUBLIC_URL` | Absolute `/signin` and `/app/...` links |
| `CHANGE_ALERT_JOB_SECRET` or `CRM_JOB_SECRET` | Digest cron auth |
| `CHANGE_ALERT_DIGEST_TO` | Optional full recipient override (ops/debug) |

## Cron

```bash
# Hourly activity digest
curl -X POST "https://YOUR-API.onrender.com/api/v1/platform/jobs/change-alert-digest" \
  -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"

# Once daily (document timezone; job is idempotent per UTC calendar day)
curl -X POST "https://YOUR-API.onrender.com/api/v1/platform/jobs/daily-ops-digest" \
  -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"

# Once weekly (idempotent per UTC week)
curl -X POST "https://YOUR-API.onrender.com/api/v1/platform/jobs/weekly-bi-digest" \
  -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"

# Once monthly (idempotent per UTC month)
curl -X POST "https://YOUR-API.onrender.com/api/v1/platform/jobs/monthly-bi-digest" \
  -H "X-Change-Alert-Job-Secret: $CHANGE_ALERT_JOB_SECRET"
```

Also keep CRM evaluate-alerts cron running so `low_stock` / `reconciliation_gap` land in the in-app bell (`crm_notifications`).

## Daily ops email template

Polished HTML in `notify/formatDailyOps`: BluearmERP `#3c50e0` header (same family as invites), KPI cards by section (Today / Open pipeline / Cash / Stock & risk), amber accent on risk counts, real `/app/...` deep links, “No major movement today” when all metrics are zero, subject variants (`quiet day` / `N risk signals`), and plain-text parity. Hourly digest header uses the same brand blue.

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
| 4 | `POST .../change-alert-digest` with secret | Digest via Resend when SMTP blocked |
| 5 | `POST .../daily-ops-digest` | One mail per enabled tenant; owner + store_admin |
| 6 | `POST .../weekly-bi-digest` | Weekly BI mail; `/app/dashboard/period-summary?period=weekly` matches |
| 7 | `POST .../monthly-bi-digest` | Monthly BI mail; period summary monthly tab |
| 8 | Auth reset / OTP | Unchanged (Supabase Auth SMTP) |

## PO expectations (free Resend)

- **No** email on every sale, purchase, zero-stock SKU, or discrepancy.
- **Yes:** hourly owner change digest; daily ops summary (financials + pending + stock/recon counts); in-app notification bell for near-realtime.
- If critical stock must email more often later: paid Resend plan + a separate job — not this free-tier path.

## Related

- [`render-deploy.md`](./render-deploy.md) — Render env and cron table
- [`supabase-auth-emails.md`](./supabase-auth-emails.md) — Auth SMTP templates
