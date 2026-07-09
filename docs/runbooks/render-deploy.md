# Deploy Go API to Render

The Docker **build** succeeding but deploy exiting with status 1 almost always means **environment variables are missing** on Render. The container has no access to `web/.env.local`.

## Required environment variables

In **Render → your service → Environment**, add:

| Key | Source |
|-----|--------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_JWT_SECRET` | Supabase → Settings → API → JWT Secret |
| `SUPABASE_DB_PASSWORD` | Supabase → Settings → Database → Database password |
| `CORS_ORIGIN` | Your Vercel URL, e.g. `https://bluearmerp-v3.vercel.app` (no trailing slash). Comma-separate for multiple origins: `https://bluearmerp-v3.vercel.app,http://localhost:5173` |

Do **not** set `PORT` — Render injects it automatically.

Optional override: `DATABASE_URL` (full Postgres DSN).

**Render requires the Supabase Session pooler — not `db.*.supabase.co`.**

Direct host `db.YOUR_REF.supabase.co` (ports 5432 or 6543) is **IPv6-only**. Render cannot reach it (`network is unreachable`). Changing only the port to 6543 on the same host **does not fix this**.

### Correct connection string (copy from Supabase)

1. Supabase Dashboard → your project → **Connect** (top bar) or **Settings → Database**
2. Under **Connection pooling**, choose **Session mode**
3. Copy the full **URI**. It must look like:

```
postgresql://postgres.hqmhlvahlvrtxtwecdip:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Notice:
- **User** is `postgres.YOUR_PROJECT_REF` (not plain `postgres`)
- **Host** is `aws-0-REGION.pooler.supabase.com` (not `db.*.supabase.co`)
- **Port** is `5432` on the pooler host (session mode)

4. Paste the entire URI as **`DATABASE_URL`** on Render → Save → redeploy

### Wrong (will fail on Render)

```
postgresql://postgres:pass@db.hqmhlvahlvrtxtwecdip.supabase.co:5432/postgres   ❌ IPv6 direct
postgresql://postgres:pass@db.hqmhlvahlvrtxtwecdip.supabase.co:6543/postgres   ❌ still wrong host
```

See [Supabase: Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) — use **Shared pooler, session mode** for IPv4 networks like Render.

Verify:

```bash
curl https://bluearmerp-v3.onrender.com/health/db
```

Expected: `"success":true` with `"auth_me_query_john":1` — not `"DB unreachable"`.

## Service settings

| Setting | Value |
|---------|--------|
| Root Directory | `api` |
| Runtime | Docker |
| Health Check Path | `/health` |

## Verify

```bash
curl https://YOUR-SERVICE.onrender.com/health
```

Expected: JSON with `"status":"ok"`.

### Verify CORS (browser calls fail but `/health` works)

```bash
curl.exe -s -i -X OPTIONS "https://YOUR-SERVICE.onrender.com/api/v1/auth/me" ^
  -H "Origin: https://bluearmerp-v3.vercel.app" ^
  -H "Access-Control-Request-Method: GET" ^
  -H "Access-Control-Request-Headers: authorization,content-type"
```

You must see `access-control-allow-origin: https://bluearmerp-v3.vercel.app`. If that header is **missing**, `CORS_ORIGIN` on Render is wrong (often still the default `http://localhost:5173`). Update it and **Save** — Render restarts the service automatically.

## Passwords with special characters

If `SUPABASE_DB_PASSWORD` contains `$`, `@`, or `#`, paste the value **literally** in the Render Environment UI. No shell quoting needed in the dashboard.

**Recommended if auth works in SQL but `/auth/me` returns 403:** set **`DATABASE_URL`** explicitly from Supabase → Settings → Database → **Connection string** → URI (use the pooler or direct string with the password already URL-encoded). Remove reliance on `SUPABASE_DB_PASSWORD` assembly — a truncated password at `$` connects to the wrong DB or an empty dataset.

Your project ref from local config should match Render `SUPABASE_URL`: `https://hqmhlvahlvrtxtwecdip.supabase.co`.

## Verify database (not just process health)

```bash
curl https://YOUR-SERVICE.onrender.com/health/db
```

After deploying the latest API, expect migrations through **141** applied on the hosted database before using Operations Hub or Communications. Run `go run ./cmd/migrate -check -from 130` locally against the same `DATABASE_URL` Render uses.

| Field | Healthy |
|-------|---------|
| `supabase_project_ref` | `hqmhlvahlvrtxtwecdip` |
| `users_linked_active` | `>= 1` |
| `tenant_roles_table` | `true` |
| `auth_me_query_john` | `1` |

If `auth_me_query_john` is `0` on Render but query **#6** in `scripts/diagnose-auth-provision.sql` returns `1` in Supabase SQL Editor, Render is pointed at the **wrong database**.

## Wire Vercel

Set `VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com` and redeploy the web app.
