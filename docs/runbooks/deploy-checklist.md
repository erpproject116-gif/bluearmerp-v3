# Production deploy checklist

Use this for **every** API + web deploy to Render/Vercel (or any hosted environment).

## Before merge

- [ ] `cd api && go test ./...`
- [ ] `cd api && go build ./...`
- [ ] `cd web && npm run build`
- [ ] If schema changed: new file in `api/migrations/` (next number after latest)
- [ ] `go run ./cmd/migrate -check` against a DB with migrations applied (CI does this via golden smoke)

## Deploy API (Render)

1. Push to branch connected to Render (or manual deploy).
2. Confirm environment variables:
   - `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` (pooler URI)
   - `CORS_ORIGIN` = your Vercel URL(s)
   - `MIGRATE_ON_START=true` (applies pending migrations on container start)
3. Wait for deploy to finish.
4. **Schema health** (must be healthy before web QA):

   ```bash
   curl -s https://YOUR-API.onrender.com/health/schema
   ```

   Expect: `"healthy": true`, `"pending_count": 0`, `"missing_tables": []` (includes `fin_supplier_invoice_attachments` from migration **142**).

5. **DB connectivity** (optional):

   ```bash
   curl -s https://YOUR-API.onrender.com/health/db
   ```

6. If `healthy: false`:
   - Read `pending_migrations` and `missing_tables` in the JSON.
   - SSH/shell on Render or run locally: `go run ./cmd/migrate` with same `DATABASE_URL`.
   - Redeploy if you changed `MIGRATE_ON_START` or Dockerfile.

## Deploy web (Vercel)

1. Confirm `VITE_API_BASE_URL=https://YOUR-API.onrender.com`
2. Deploy / promote production.
3. Hard refresh browser (Ctrl+Shift+R) after deploy.

## Smoke after deploy

```bash
# Public schema check
curl -s https://YOUR-API.onrender.com/health/schema

# Authenticated golden path (local or CI pattern)
export API_BASE=https://YOUR-API.onrender.com
export BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs)   # needs valid user in DB
GOLDEN_CREATE_QUOTATION=true node scripts/golden-path-smoke.mjs
```

Attachment endpoints are exercised automatically when demo PO/SI rows exist.

## Month-close

Pilot month-end steps: [`month-close-checklist.md`](month-close-checklist.md).

## Manual UX spot-check (5 min)

- [ ] Sign in
- [ ] Open one **Sale** → Details + **Invoice** tab (line breakdown visible)
- [ ] Open one **Purchase** → attachments load (no 500 in console)
- [ ] CRM / dashboard loads without 429 spam in console

## Rollback

- **API:** Render → deploy previous image; schema is forward-only — do not delete migrations.
- **Web:** Vercel → redeploy previous build.

## When to stop the release

- `/health/schema` not healthy
- Golden path smoke fails on production
- New migration failed in Render logs (`Applying:` then error)

See also: [`render-deploy.md`](render-deploy.md), [`roadmap.md`](../roadmap.md) Phase 0.
