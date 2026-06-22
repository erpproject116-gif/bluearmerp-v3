# Deploy Go API to Render

The Docker **build** succeeding but deploy exiting with status 1 almost always means **environment variables are missing** on Render. The container has no access to `web/.env.local`.

## Required environment variables

In **Render → your service → Environment**, add:

| Key | Source |
|-----|--------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_JWT_SECRET` | Supabase → Settings → API → JWT Secret |
| `SUPABASE_DB_PASSWORD` | Supabase → Settings → Database → Database password |
| `CORS_ORIGIN` | Your Vercel URL, e.g. `https://your-app.vercel.app` (no trailing slash) |

Do **not** set `PORT` — Render injects it automatically.

Optional override: `DATABASE_URL` (full Postgres DSN, e.g. Supabase pooler on port 6543).

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

## Passwords with special characters

If `SUPABASE_DB_PASSWORD` contains `$`, `@`, or `#`, paste the value **literally** in the Render Environment UI. No shell quoting needed in the dashboard.

## Wire Vercel

Set `VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com` and redeploy the web app.
