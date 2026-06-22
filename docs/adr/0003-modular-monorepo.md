# ADR 0003: Modular monorepo

## Status

Accepted

## Context

Enterprise ERP domains (inventory, commercial, finance) must plug in without rewriting core platform code.

## Decision

1. **Go:** `internal/platform/*` for auth, audit, config; `internal/modules/<domain>` registers routes on a shared chi router.
2. **SQL:** `api/migrations/00N_<domain>_<desc>.sql` per domain; `module_registry` + `tenant_modules` gate features.
3. **Web:** `web/src/modules/<domain>` for screens; sidebar driven by `enabled_module_codes` from `/auth/me`.
4. **MVP** ships only `core` + `inventory` modules.

## Consequences

- New modules add a migration file, Go package, and Solid route folder without touching inventory code.
- Permission codes are seeded even when MVP grants all to tenant owner.
