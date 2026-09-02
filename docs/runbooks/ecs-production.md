# ECS production verification

**Goal:** Confirm `api.bluearmerp.com` (Alibaba ECS) is the sole production API before deleting any legacy hosts.

## Automated checks

```bash
node scripts/verify-ecs-production.mjs
```

| Check | Expected |
|-------|----------|
| ECS `/health` | 200 |
| ECS `/health/schema` | `healthy: true`, `pending_count: 0` |
| ECS CORS for `app.bluearmerp.com` | `access-control-allow-origin` set |
| Vercel JS bundle API host | `api.bluearmerp.com` (not legacy hosts) |
| CMS `/articles` on app host | 200 |
| ECS public CMS API | 200 |

## Production inventory

| Component | Value |
|-----------|--------|
| Public API | `https://api.bluearmerp.com` |
| ECS instance | `i-t4n5tdhzaktd0x6tc34w` (`bluearm-api`, `ap-southeast-1`) |
| EIP | `43.98.186.58` |
| SPA | Vercel → `https://app.bluearmerp.com` |
| Database | Supabase (session pooler URI on ECS) |
| Background jobs | ECS crontab — see [`alibaba-deploy.md`](./alibaba-deploy.md) |
| API deploy | GitHub Actions → [`api-ecs-deploy.yml`](../../.github/workflows/api-ecs-deploy.yml) |

## Vercel (confirm in dashboard)

| Variable | Must be |
|----------|---------|
| `VITE_API_BASE_URL` | `https://api.bluearmerp.com` |
| `CMS_API_BASE_URL` | `https://api.bluearmerp.com` |
| `PUBLIC_SITE_URL` | `https://app.bluearmerp.com` |

## ECS env (on Docker container)

See [`deploy/alibaba/env.api.example`](../../deploy/alibaba/env.api.example) and [`alibaba-deploy.md`](./alibaba-deploy.md).

Key vars: `DATABASE_URL`, `SUPABASE_*`, `CORS_ORIGIN`, `MIGRATE_ON_START`, `RESEND_*`, `CHANGE_ALERT_JOB_SECRET`, `GOOGLE_OAUTH_*`, `CMS_*`.

**Deferred:** PayMongo live billing (`PAYMONGO_*` + webhook URL) — configure when billing goes live.

## Operator checklist before deleting legacy API host

- [ ] `node scripts/verify-ecs-production.mjs` passes
- [ ] GitHub secrets set for **API ECS deploy** workflow
- [ ] One successful workflow run after merging deploy workflow
- [ ] Google OAuth redirect includes `https://api.bluearmerp.com/api/v1/comms/gmail/callback`
- [ ] Logged-in app smoke (Production or Sales loads data)

## Related

- [`alibaba-deploy.md`](./alibaba-deploy.md) — ECS deploy, crontab, security group
- [`deploy-checklist.md`](./deploy-checklist.md) — release checklist
