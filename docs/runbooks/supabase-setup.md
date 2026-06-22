# Supabase project setup

## Create project

1. Create a **new** Supabase project (do not reuse v2).
2. Note: Project URL, anon key, JWT secret, database connection string (pooler, transaction mode).

## Google OAuth

1. Dashboard → Authentication → Providers → Google → **Enable**.
2. Create a **Web application** OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
3. **Authorized redirect URIs** (Google side) — add **only** the Supabase callback:

   ```text
   https://hqmhlvahlvrtxtwecdip.supabase.co/auth/v1/callback
   ```

   Replace `hqmhlvahlvrtxtwecdip` with your project ref. Do **not** put `localhost` here.

4. Copy **Client ID** and **Client secret** into Supabase → Google provider.
5. Dashboard → Authentication → **URL Configuration**:

   | Field | Value |
   |-------|--------|
   | Site URL | `http://localhost:5173` |
   | Redirect URLs | `http://localhost:5173/auth/callback` |

### `Unable to exchange external code` / `server_error`

This error comes from **Supabase ↔ Google**, before your app loads data. Check:

| Check | Fix |
|-------|-----|
| Wrong client secret | Re-copy secret from Google → Supabase Google provider |
| Wrong client type | Must be **Web application**, not Desktop/iOS |
| OAuth app in Testing | Add your Gmail under **Test users** in Google consent screen |
| Mismatched project | Client ID in Supabase must match the Google project with the redirect URI above |
| Stale OAuth attempt | Clear `localhost:5173` site data → Local Storage, try incognito |

### Sign-in flow (redirect, not popup)

Google sign-in uses a **full-page redirect** (standard for Supabase PKCE). You leave `localhost:5173` briefly, sign in with Google, then return to `/auth/callback`. A popup is not used and is not required.

## Wire secrets

Copy `.env.example` to **`.env` at the repo root** — see [environment-variables.md](./environment-variables.md).

```env
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role>
SUPABASE_JWT_SECRET=<JWT secret — same API page>
SUPABASE_DB_PASSWORD=<database password — Settings → Database>
```

The Go API builds `DATABASE_URL` automatically. You do not need to paste the full Postgres connection string unless you prefer `DATABASE_URL` as an override.

**Web** reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the same root `.env` (no duplicate `VITE_*` keys required).

Optional: `VITE_API_BASE_URL=http://localhost:8080` for production builds. Vite dev proxies `/api` to `:8080` when unset.

## Apply schema

See **[sql-run-order.md](./sql-run-order.md)** for the full script sequence.

**Local (recommended — migrations + all seeds in order):**

```bash
supabase db reset
```

This runs, in order:

1. `api/migrations/001_platform.sql`
2. `api/migrations/002_inventory_master.sql`
3. `api/migrations/003_platform_access.sql`
4. `supabase/seed.sql`
5. `scripts/seed-platform-owners.sql` — BLUEARM + `itsjohnranel@gmail.com`, `bluearmph@gmail.com`
6. `scripts/seed-demo-inventory.sql`

**After reset:** sign in with Google for each owner Gmail, then:

```bash
psql "$DATABASE_URL" -f scripts/link-platform-owners.sql
```

**Remote:**

```bash
supabase link --project-ref <ref>
supabase db push
```

Migrations source: `api/migrations/*.sql` (configured in `supabase/config.toml`).
