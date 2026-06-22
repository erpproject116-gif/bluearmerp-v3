# Demo sign-in (local dev)

## Credentials

| Field | Value |
|-------|-------|
| Email | `demo@demo.bluearm.local` |
| Password | `DemoBluearm2026!` |
| Tenant | DEMO000 — Pacific Rim Modular Furnishing Corp. |

**Never use this password in production.** Production should use env-injected secrets or disable demo sign-in.

## Setup steps

1. Complete [demo-seed-data.md](./demo-seed-data.md) through database reset.
2. Create the Auth user in Supabase with the email/password above.
3. Run `scripts/link-demo-auth-user.sql` with the Auth user's UUID.
4. Copy `.env.example` → `.env` at repo root — [environment-variables.md](./environment-variables.md).
5. Start API: `cd api && go run ./cmd/server`
6. Start web: `cd web && npm run dev`
8. Open `http://localhost:5173/signin` → **Try free demo**

## Google OAuth

Use **Continue with Google** after enabling the provider and linking your Gmail to a `public.users` row (same `link-demo-auth-user.sql` pattern).
