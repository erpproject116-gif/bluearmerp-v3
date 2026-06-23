# ADR 0004: Performance patterns (auth cache, audit tiers, batching)

**Status:** Accepted  
**Date:** 2026-06-23

## Context

Bluearm ERP v3 targets **p95 < 400ms** on warm list routes. The auth middleware ran **4 SQL queries** per request; audit logging added a sync `INSERT` on most writes; CSV import used one transaction per row.

## Decisions

### 1. In-process auth session cache + `users.auth_revision`

- Cache fully materialized `TenantUser` keyed by JWT `sub`.
- On cache hit, compare `users.auth_revision` (single indexed lookup) before trusting entry.
- Bump `auth_revision` in the same transaction as permission mutations.
- Kill switches: `AUTH_CACHE_ENABLED=false`, `AUTH_CACHE_TTL_SECONDS=0`.

### 2. Split audit durability tiers

- **Sync (`LogSync`):** `finance.*`, `inventory.stock_*`, `user.*`, `role.*`, `group.*`, `crm.job.*`, `sales.price_batch`.
- **Async batch:** all other audit events via background worker (flush every 75ms or 100 rows).
- Kill switch: `AUDIT_ASYNC=false`.

### 3. Bulk CSV import

- Validate all rows first; import valid rows in **one transaction**; one summary audit row.

### 4. pgxpool tuning

- `DB_MAX_CONNS` (default 10), `DB_MIN_CONNS`, lifetime/idle env vars.

### 5. Attachment downloads

- `http.ServeContent` via `filedownload` package with path traversal guards.

### 6. CRM outbox (`outbox_events`)

- Idempotent `idempotency_key`; drained by CRM job before alert evaluation.

### 7. Selective gzip

- `GZIP_ENABLED=true` compresses responses ≥ 8KB; excludes `/health` and `*/download`.

## Rejected

- Local `O_APPEND` commit logs (Postgres is the log).
- Kafka / NATS at current scale.
- Async business transactions (sales, stock, receipts).

## Risks accepted

| Risk | Mitigation |
|------|------------|
| Stale permissions | `auth_revision` + TTL + explicit cache invalidation |
| Audit loss on crash (async tier) | Shutdown flush; sync tier for critical codes |
| CSV all-or-nothing after validation | Documented in baseline doc |
| Multi-instance cache | `auth_revision` check on hit |

## References

- [baseline-and-targets.md](../performance/baseline-and-targets.md)
- [environment-variables.md](../runbooks/environment-variables.md)
