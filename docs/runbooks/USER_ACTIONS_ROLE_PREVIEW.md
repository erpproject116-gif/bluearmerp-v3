# USER ACTIONS — Role preview (“View as …”)

## What shipped

Owners and platform superadmins can start a **read-only role template preview** from the sidebar (“View as role…”). Server overlay strips owner/platform power, reloads the chosen role’s permissions (no personal overrides), and blocks mutating HTTP except end/extend.

## Deploy checklist

1. Apply migration `313_role_preview.sql` (columns on `users`) — confirm with:
   ```sql
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'users'
     and column_name like 'role_preview_%'
   order by 1;
   -- expect: role_preview_expires_at, role_preview_home_location_id,
   --         role_preview_role_code, role_preview_started_at
   ```
2. Deploy API (ECS) — Start preflight + migration-aware errors require API deploy.
3. Deploy web (Vercel) — FE recovery / Exit / scoped bootstrap copy can ship alone (D9).
4. Smoke: owner → View as `store_admin` → banner + menus change → create sale → clear read-only (no toast flood) → Exit preview.

## Notes

- Not user impersonation (does not copy another user’s overrides/scopes).
- Mutually exclusive with support sessions.
- Digests / unrelated flags are untouched.
- Overlay **soft-fails**: if role flags/permissions cannot load, preview columns are cleared, identity is restored, and `/auth/me` keeps working. `POST /auth/role-preview/end` always clears the caller’s own preview columns (idempotent).
- **Start preflight** loads the target role’s flags *before* writing preview columns. Missing `role_preview_*` columns return `ERR_SETUP` with an explicit migration-313 message (you stay owner — no sticky wall).

## Network triage (after Start → “Cannot reach the API”)

Use this order — do **not** jump to `CORS_ORIGIN` first.

| Step | Check | Action |
|------|--------|--------|
| 1 | Did Start return `ERR_SETUP` / migration copy? | Apply `313_role_preview.sql`, redeploy API if needed. |
| 2 | Did Start return conflict / role-load failure? | Stay owner; fix tenant role flags; retry. |
| 3 | Start 200 but `/auth/me` fails? | UI should auto-end + clear attempt flag. Use **Exit role preview**, then hard-refresh (Ctrl+Shift+R). |
| 4 | Console shows CORS / Workbox `no-response` on `/auth/me`? | Often a **side effect** of a failed authed call (SW / opaque error), not proof that `CORS_ORIGIN` is wrong. Clear preview first. |
| 5 | Still failing with no preview columns set? | Then verify real CORS: API `CORS_ORIGIN` = app origin (no trailing slash), redeploy API, hard-refresh. |

**Symptom (legacy):** After starting View-as-role, the app shows “Cannot reach the API” and the browser console reports CORS / Workbox `no-response` on `https://api.bluearmerp.com/api/v1/auth/me`.

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

**After soft-fail + FE recovery deploy:** broken overlays auto-clear; Start failures leave you as owner; Exit preview should work even if overlay did not activate. Prefer the Exit button / `POST /auth/role-preview/end` before SQL.

**If overlay succeeds but the app still shows CORS / Cannot reach API:** hard-refresh (Ctrl+Shift+R) so the service worker updates — older builds intercepted cross-origin `api.bluearmerp.com` fetches and turned network blips into Workbox `no-response` + CORS noise. The error screen also offers **Exit role preview** when a preview attempt is suspected.
