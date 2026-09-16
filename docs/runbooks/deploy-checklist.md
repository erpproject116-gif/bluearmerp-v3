# Production deploy checklist

Use this for **every** API + web deploy (ECS + Vercel).

## Before merge

- [ ] `cd api && go test ./...`
- [ ] `cd api && go build ./...`
- [ ] `cd web && npm run build`
- [ ] If schema changed: new file in `api/migrations/` (next number after latest)
- [ ] `go run ./cmd/migrate -check` against a DB with migrations applied (CI does this via golden smoke)

## Deploy API (Alibaba ECS)

1. Merge to `main` (or run **API ECS deploy** workflow manually).
2. Workflow runs tests, then `deploy/alibaba/deploy-api-on-ecs.sh` on ECS via RunCommand.
3. Confirm environment on the `bluearm-api` Docker container (first-time / secret changes only):
   - `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` (Supabase session pooler URI)
   - `CORS_ORIGIN` = your Vercel URL(s) + `https://app.bluearmerp.com`
   - `MIGRATE_ON_START=true` (applies pending migrations on container start)
4. **Schema health** (must be healthy before web QA):

   ```bash
   curl -s https://api.bluearmerp.com/health/schema
   ```

   Expect: `"healthy": true`, `"pending_count": 0`, `"missing_tables": []`.

5. **DB connectivity** (optional):

   ```bash
   curl -s https://api.bluearmerp.com/health/db
   ```

6. If `healthy: false`:
   - Read `pending_migrations` and `missing_tables` in the JSON.
   - On ECS: `docker logs bluearm-api` or run `go run ./cmd/migrate` locally with the same `DATABASE_URL`.
   - Redeploy after fixing env or migrations.

Automated check: `node scripts/verify-ecs-production.mjs`

## Deploy web (Vercel)

1. Confirm `VITE_API_BASE_URL=https://api.bluearmerp.com` and `CMS_API_BASE_URL=https://api.bluearmerp.com`
2. Deploy / promote production.
3. Hard refresh browser (Ctrl+Shift+R) after deploy.
4. **Supabase Auth URLs + emails** (if first deploy or Auth changed):
   - Redirect allowlist includes `{web origin}/auth/callback` **and** `{web origin}/auth/reset-password`
   - Auth templates applied from `supabase/templates/` (see [`supabase-auth-emails.md`](./supabase-auth-emails.md))
   - Record smoke results in [`supabase-auth-emails-smoke.md`](./supabase-auth-emails-smoke.md)

## Smoke after deploy

```bash
# Public schema check
curl -s https://api.bluearmerp.com/health/schema

# Full production gate
node scripts/verify-ecs-production.mjs

# Authenticated golden path (local or CI pattern)
export API_BASE=https://api.bluearmerp.com
export BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs)   # needs valid user in DB
GOLDEN_CREATE_QUOTATION=true node scripts/golden-path-smoke.mjs
```

Attachment endpoints are exercised automatically when demo PO/SI rows exist.

### Live-tenant E2E (read-only first)

See [`docs/qa/live-e2e-baseline.md`](../qa/live-e2e-baseline.md) and `web/e2e/README.md`.

```bash
cd web
# Optional once: npm run test:e2e:auth:save
set CI=true
set E2E_BASE_URL=https://app.bluearmerp.com
npm run test:e2e:live:read-only
npm run e2e:tickets:draft
npm run e2e:report
```

**Stop release / stop live E2E if:** schema unhealthy, unexpected mutation of non-`E2E-*` rows, repeated 429 after wait, unexplained 5xx burst, reconciliation mismatch, or wrong tenant.

**Mutating live runs** require explicit `E2E_TIER` + `E2E_ALLOW_MUTATIONS=1` + `E2E_RUN_CONFIRM` — never default on production.

## Month-close

Pilot month-end steps: [`month-close-checklist.md`](month-close-checklist.md).

## Manual UX spot-check (5 min)

- [ ] Sign in
- [ ] Open one **Sale** → Details + **Invoice** tab (line breakdown visible)
- [ ] Open one **Purchase** → attachments load (no 500 in console)
- [ ] CRM / dashboard loads without 429 spam in console

## Rollback

- **API:** Re-run deploy workflow on a previous `main` commit, or on ECS: `git reset --hard <sha>` and run `deploy/alibaba/deploy-api-on-ecs.sh`. Schema is forward-only — do not delete migrations.
- **Web:** Vercel → redeploy previous build.

## When to stop the release

- `/health/schema` not healthy
- Golden path smoke fails on production
- New migration failed in `docker logs bluearm-api` (`Applying:` then error)

See also: [`alibaba-deploy.md`](./alibaba-deploy.md), [`roadmap.md`](../roadmap.md) Phase 0.
