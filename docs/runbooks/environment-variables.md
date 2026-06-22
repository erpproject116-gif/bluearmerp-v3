# Environment variables

Bluearm ERP v3 uses a **single root `.env`** file. You do not need to paste a full `DATABASE_URL` if you set `SUPABASE_URL` and `SUPABASE_DB_PASSWORD`.

## Where to copy values (Supabase Dashboard)

| Variable | Dashboard location | Used by |
|----------|-------------------|---------|
| `SUPABASE_URL` | Settings → API → Project URL | Web + API |
| `SUPABASE_ANON_KEY` | Settings → API → anon public | Web (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role | Server scripts / future admin jobs **only** |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Secret | Go API (legacy HS256 tokens only) |
| `SUPABASE_URL` | Settings → API → Project URL | Go API **JWKS** (ES256 — required for new projects) |
| `SUPABASE_DB_PASSWORD` | Settings → Database → Database password | Go API (builds Postgres URL) |

## Why not only anon + service role + URL?

| Need | Can service role replace it? | Why |
|------|------------------------------|-----|
| Browser sign-in | Use **anon** key | Service role must never ship to the web app |
| Verify user JWTs | **JWKS from `SUPABASE_URL`** (ES256) or legacy JWT secret (HS256) | Service role is a signed token, not the signing secret |
| Go SQL via pgx | Use **DB password** | Service role talks to Supabase HTTP APIs, not raw Postgres |

So the minimal practical set is:

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # optional until you add server-side Supabase client features
SUPABASE_JWT_SECRET
SUPABASE_DB_PASSWORD
```

`DATABASE_URL` is **optional** — the API builds:

```text
postgresql://postgres:{SUPABASE_DB_PASSWORD}@db.{project-ref}.supabase.co:5432/postgres
```

from `SUPABASE_URL` + `SUPABASE_DB_PASSWORD`.

## Local Supabase CLI

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_JWT_SECRET=<from supabase status>
```

Omit `SUPABASE_DB_PASSWORD` — the API uses `postgresql://postgres:postgres@127.0.0.1:54322/postgres` automatically.

Run `supabase status` to print local keys.

## Setup

**Option A — root `.env` (recommended):**

```bash
cp .env.example .env
```

**Option B — `web/.env.local` (also works for Go API):**

```bash
cp .env.example web/.env.local
```

The Go API loads, in order: `.env`, `web/.env.local`, `api/.env` (later overrides earlier).

When running from `api/`:

```bash
cd api && go run ./cmd/server
```

Fill values from the Supabase Dashboard.

## Security

- Never commit `.env` or `web/.env.local`
- Never put `SUPABASE_SERVICE_ROLE_KEY` in the web bundle
- Rotate keys if they were committed to git
