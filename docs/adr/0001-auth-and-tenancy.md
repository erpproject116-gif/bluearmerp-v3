# ADR 0001: Auth and tenancy

## Status

Accepted

## Context

Bluearm ERP v3 uses Supabase Auth for identity and a Go API for business logic. Tenants are isolated at the application layer via `tenant_id` on every business table.

## Decision

1. **Supabase Auth** issues JWTs (Google OAuth + email/password for demo).
2. **Go middleware** validates JWT (HS256 with `SUPABASE_JWT_SECRET`) and loads `users` + `tenants` in one query.
3. **MVP provisioning:** users must have a pre-existing `public.users` row with `auth_user_id` linked after Google sign-in.
4. **Default platform superadmins:** `itsjohnranel@gmail.com` and `bluearmph@gmail.com` on tenant `BLUEARM`, seeded via `scripts/seed-platform-owners.sql` and linked via `scripts/link-platform-owners.sql`.
5. **Future modules:** tenants with `auto_enable_all_modules = true` (BLUEARM) receive new `module_registry` rows automatically via DB trigger; platform superadmins also receive all modules in `/auth/me`.
6. **Demo tenant** `DEMO000` is separate for public demo sign-in.

## Consequences

- First-time Google users without a `users` row receive 401 from `/api/v1/auth/me` until linked via `scripts/link-demo-auth-user.sql`.
- RLS may be enabled for defense-in-depth; Go remains the primary authorization gate.
