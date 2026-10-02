# USER ACTIONS — Role preview (“View as …”)

## What shipped

Owners and platform superadmins can start a **read-only role template preview** from the sidebar (“View as role…”). Server overlay strips owner/platform power, reloads the chosen role’s permissions (no personal overrides), and blocks mutating HTTP except end/extend.

## Deploy

1. Apply migration `313_role_preview.sql` (columns on `users`).
2. Deploy API (ECS) + web (Vercel).
3. Smoke: owner → View as `store_admin` → menus change → create sale → 403 → Exit preview.

## Notes

- Not user impersonation (does not copy another user’s overrides/scopes).
- Mutually exclusive with support sessions.
- Digests / unrelated flags are untouched.
