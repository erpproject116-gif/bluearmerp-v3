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
- Overlay **soft-fails**: if role flags/permissions cannot load, preview columns are cleared, identity is restored, and `/auth/me` keeps working. `POST /auth/role-preview/end` always clears the caller’s own preview columns (idempotent).

## Stuck preview recovery (looks like CORS)

**Symptom:** After starting View-as-role, the app shows “Cannot reach the API” and the browser console reports CORS / Workbox `no-response` on `https://api.bluearmerp.com/api/v1/auth/me`.

**Cause (usually):** Not a broken `CORS_ORIGIN`. A failed role-preview overlay used to hard-fail middleware with 500 before CORS-friendly handling completed; every authed call (including Exit preview) failed, so the session looked like a total API outage.

**Immediate SQL (prod):**

```sql
-- Who is stuck?
select id, email, tenant_id, tenant_role, role_preview_role_code, role_preview_expires_at
from public.users
where role_preview_role_code is not null;

-- Unstick one user (bump revision so cached identity refreshes)
update public.users
set
  role_preview_role_code = null,
  role_preview_home_location_id = null,
  role_preview_started_at = null,
  role_preview_expires_at = null,
  auth_revision = auth_revision + 1,
  updated_at = now()
where lower(email) = lower('USER_EMAIL_HERE')
  and role_preview_role_code is not null;
```

Then hard-refresh the app. `/auth/me` should return 200.

**After soft-fail deploy:** broken overlays auto-clear; Exit preview should work even if overlay did not activate. Prefer the Exit button / `POST /auth/role-preview/end` before SQL.
