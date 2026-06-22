# User Management module

Invite-first Google provisioning for tenant users and roles.

## Features

- **Users** — list, invite, edit role/status, revoke pending invites
- **Roles** — system roles (`member`, `store_admin`) plus custom roles with permission flags

## Related docs

- [user-management runbook](../runbooks/user-management.md)
- [ADR 0001 — Auth and tenancy](../adr/0001-auth-and-tenancy.md)

## Database

Migration `012_user_management.sql`:

- `tenant_roles`
- `user_invites`
- `users.status` → `active` | `invited` | `disabled`
- `module_registry.user_management`
