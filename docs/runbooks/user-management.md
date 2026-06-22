# User Management module

Tenant administrators invite users by email. Invited users sign in with **Google using that exact email**; the Go API auto-links `auth_user_id` on first request.

## Navigation

| Layer | Label | Route |
|-------|-------|-------|
| Sidebar | User Management | `/app/user-management/users` |
| Header | Users | `/app/user-management/users` |
| Header | Roles | `/app/user-management/roles` |

Visible only when `/auth/me` reports `can_manage_users` (tenant owner, platform superadmin, or role with `can_manage_users`).

## Invite flow

1. Admin opens **User Management → Users → + Invite user**
2. Enters email, full name, and role
3. API creates `users` row (`status = invited`) and `user_invites` audit row
4. Invitee clicks **Continue with Google** on `/signin` using the invited Gmail
5. On `/auth/me`, middleware matches JWT email to invited row and sets `auth_user_id` + `status = active`

No Supabase invite email is sent (Google provision only).

## Roles

System roles (seeded per tenant):

| Code | Manage users | Form settings |
|------|--------------|---------------|
| `member` | No | No |
| `store_admin` | Yes | Yes |

Custom roles can be created under **Roles** with permission toggles.

Tenant **owner** (`tenants.owner_user_id`) is shown with an Owner badge and cannot be disabled or reassigned via this MVP UI.

## API

| Method | Path |
|--------|------|
| GET | `/api/v1/user-management/users` |
| POST | `/api/v1/user-management/invites` |
| PATCH | `/api/v1/user-management/users/{id}` |
| POST | `/api/v1/user-management/invites/{id}/revoke` |
| GET | `/api/v1/user-management/roles` |
| POST | `/api/v1/user-management/roles` |
| PATCH | `/api/v1/user-management/roles/{id}` |

All routes require `can_manage_users`.

## Bootstrap vs ongoing

| Scenario | Approach |
|----------|----------|
| First platform superadmins | Still use `scripts/link-platform-owners.sql` once |
| New tenant users | User Management invite (no SQL) |
| Local demo sign-in | Set `VITE_DEMO_SIGNIN_ENABLED=true` in `web/.env.local` |

## Manual test checklist

1. Sign in as tenant owner → **User Management** appears in sidebar
2. Invite `newuser@gmail.com` as `member` → row shows **Invited**
3. Sign in with that Gmail → lands in app without SQL link script
4. Create custom role with **Can manage users** → assign to user → they see User Management
5. Revoke pending invite → same Gmail gets forbidden on `/auth/me`
6. Production sign-in page has no **Try free demo** button (unless `VITE_DEMO_SIGNIN_ENABLED=true`)
