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
| Health Check Path | `/health/schema` (fails if migrations pending) |
| `MIGRATE_ON_START` | `true` — runs `/migrate` before server in Docker |

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

You must see `access-control-allow-origin: https://bluearmerp-v3.vercel.app`. If that header is **missing**:

1. **`CORS_ORIGIN` on Render is wrong or missing** — set exactly:
   ```
   https://bluearmerp-v3.vercel.app,http://localhost:5173
   ```
   No trailing slashes. Save — Render restarts automatically.

2. **Render service is waking from sleep (free tier)** — the first request after idle can fail with a CORS-looking error because the proxy returns 502 before the Go app runs. Wait 30–60s and hard-refresh the Vercel app.

3. **Deploy in progress** — wait for Render deploy to finish, then retry.

After deploying the latest API, Vercel preview URLs (`*.vercel.app`) are allowed automatically when your production Vercel URL is in `CORS_ORIGIN`.

## Email / SMTP on Render

Document email uses `SMTP_HOST`, `SMTP_FROM`, and usually `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` (default `587`).

**Render free web services block outbound SMTP** on ports `25`, `465`, and `587`. Env vars can be set correctly and send-email will still fail (often a hang → 500, or a timeout error after deploy of the short SMTP dial).

Options:
1. **Upgrade** the API service to any **paid** instance type (ports 465/587 work; port 25 stays blocked).
2. Use **Gmail OAuth** instead (HTTPS, not SMTP): set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT`, then **Communications → Settings → Connect Gmail**.
3. Use a transactional provider over **HTTPS API** (SendGrid/Resend/etc.) — not wired yet; SMTP or Gmail only today.

After changing SMTP env vars, **redeploy** (or restart) so the process picks them up.

## Passwords with special characters

If `SUPABASE_DB_PASSWORD` contains `$`, `@`, or `#`, paste the value **literally** in the Render Environment UI. No shell quoting needed in the dashboard.

**Recommended if auth works in SQL but `/auth/me` returns 403:** set **`DATABASE_URL`** explicitly from Supabase → Settings → Database → **Connection string** → URI (use the pooler or direct string with the password already URL-encoded). Remove reliance on `SUPABASE_DB_PASSWORD` assembly — a truncated password at `$` connects to the wrong DB or an empty dataset.

Your project ref from local config should match Render `SUPABASE_URL`: `https://hqmhlvahlvrtxtwecdip.supabase.co`.

## Verify database (not just process health)

```bash
curl https://YOUR-SERVICE.onrender.com/health/db
```

After deploying the latest API, expect migrations through **142** applied on the hosted database before using purchase attachments or Communications. `MIGRATE_ON_START=true` applies pending migrations on container start; verify with:

```bash
curl https://YOUR-SERVICE.onrender.com/health/schema
```

Expect `"healthy": true`. If not, see [`deploy-checklist.md`](deploy-checklist.md).

Legacy check:

```bash
curl https://YOUR-SERVICE.onrender.com/health/db
```

| Field | Healthy |
|-------|---------|
| `supabase_project_ref` | `hqmhlvahlvrtxtwecdip` |
| `users_linked_active` | `>= 1` |
| `tenant_roles_table` | `true` |
| `auth_me_query_john` | `1` |

If `auth_me_query_john` is `0` on Render but query **#6** in `scripts/diagnose-auth-provision.sql` returns `1` in Supabase SQL Editor, Render is pointed at the **wrong database**.

## Wire Vercel

Set `VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com` and redeploy the web app.
