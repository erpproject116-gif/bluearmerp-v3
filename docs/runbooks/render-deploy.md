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

## Wire Vercel

Set `VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com` and redeploy the web app.
