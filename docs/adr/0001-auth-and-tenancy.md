# ADR 0001: Auth and tenancy

## Status

Accepted (updated for invite-first provisioning)

## Context

Bluearm ERP v3 uses Supabase Auth for identity and a Go API for business logic. Tenants are isolated at the application layer via `tenant_id` on every business table.

## Decision

1. **Supabase Auth** issues JWTs (Google OAuth in production; optional email/password demo locally).
2. **Go middleware** validates JWT (JWKS ES256 and/or legacy HS256) and loads `users` + `tenants`.
3. **Invite-first provisioning:** admins create `users` rows with `status = invited`; on first Google sign-in the API auto-links `auth_user_id` when JWT `email` matches the invited row.
4. **Bootstrap superadmins:** `itsjohnranel@gmail.com` and `bluearmph@gmail.com` on tenant `BLUEARM` via `scripts/seed-platform-owners.sql`. On first Google sign-in the API auto-links `active` rows without `auth_user_id` and upserts `platform_users` (same outcome as `scripts/link-platform-owners.sql`).
5. **Roles:** `tenant_roles` per tenant; `users.tenant_role` stores `role_code`. Permissions `can_manage_users` and `can_manage_form_settings` drive UI and API gates.
6. **Future modules:** tenants with `auto_enable_all_modules = true` receive new registry rows via DB trigger.
7. **Demo tenant** `DEMO000` remains for local dev when `VITE_DEMO_SIGNIN_ENABLED=true`.

## Consequences

- Day-to-day onboarding uses **User Management → Invite** instead of SQL link scripts.
- Google email must match the invited email exactly (case-insensitive).
- If the same email is invited on multiple tenants, auto-link returns forbidden (contact admin).
- Platform bootstrap still requires `link-platform-owners.sql` for the first superadmins.
