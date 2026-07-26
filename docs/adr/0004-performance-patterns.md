# ADR 0004: Performance patterns (auth cache, audit tiers, batching)

**Status:** Accepted  
**Date:** 2026-06-23

## Context

Bluearm ERP v3 targets **p95 < 400ms** on warm list routes. The auth middleware ran **4 SQL queries** per request; audit logging added a sync `INSERT` on most writes; CSV import used one transaction per row.

## Decisions

### 1. In-process auth session cache + `users.auth_revision`

- Cache fully materialized `TenantUser` keyed by `authUserID|tenantID`.
- **A live cache hit is trusted for the rest of the TTL** (amended 2026-07-26; see §8).
- `users.auth_revision` is read on the miss path and stamped onto the entry; it is
  still bumped in the same transaction as permission mutations, which is what makes
  a restarted or cold process pick up the change.
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

### 8. Trust-the-TTL auth hot path (amendment, 2026-07-26)

Measurement showed an authenticated GET still paid a multi-query auth tax even on a
cache hit: an `auth_revision` SELECT, a `platform_users` SELECT plus a
`last_signed_in_at` UPDATE, a `tenant_roles` SELECT for `apply_user_scopes`, and an
`auth_session_activity` UPDATE. All of that is now folded into the single cache entry:

| Change | Before | After |
|---|---|---|
| Cache hit | SELECT `auth_revision` to validate | Trusted until TTL expiry |
| Platform staff identity | Re-loaded on every request | Loaded on miss, stored on `TenantUser` |
| `platform_users.last_signed_in_at` | UPDATE per request | UPDATE at most every 15 min |
| `auth_session_activity` | UPDATE per interactive request | UPDATE only when the stamp is older than `SESSION_ACTIVITY_WRITE_SECONDS` (default 30s); the idle SELECT is unchanged |
| `tenant_roles.apply_user_scopes` | SELECT per branch resolve and per scoped list | `TenantUser.ApplyUserScopes`, loaded with the session |

The revision check only ever protected against *another process* mutating
permissions, which a process-local cache cannot solve in general — a second API
instance was always up to TTL stale. Dropping it removes a query without changing
the staleness bound. Correctness now rests on invalidation, which was extended to
cover the gaps this amendment opened:

- `usermgmt.patchRole` → `InvalidateUsersByTenantRole` (role flags are cached).
- `console.patchStaff` → `InvalidateUser` (platform role / deactivation are cached).

### 9. Process-local TTL caches for tenant gating (2026-07-26)

`ttlcache` (map + RWMutex + TTL + cap, same shape as the auth cache) backs the three
middlewares that ran on every mutating request:

| Surface | Key | Default TTL | Env kill switch | Invalidated by |
|---|---|---|---|---|
| Entitlement billing state | `tenantID` | 30s | `ENTITLEMENT_CACHE_TTL_SECONDS=0` | `customerregistry.NotifyTenantBillingChanged` (urgency recompute, subscription create, tenant link) |
| Module / feature enabled | `tenantID\|code` | 30s | `MODULE_CACHE_TTL_SECONDS=0` | `patchTenantModules` prefix-flush |
| Setup readiness | `tenantID` | 15s | `SETUP_READY_CACHE_TTL_SECONDS=0` | foundation-step ack; short TTL otherwise |

Two deliberate asymmetries:

- Only the **raw** billing row is cached. `WriteBlocked` and `DaysRemaining` are
  recomputed per request, so a grace deadline that passes mid-TTL still blocks.
- Only a **ready** setup answer is cached. An incomplete workspace keeps
  re-detecting, so finishing the last step unblocks the very next request.

## Rejected

- Local `O_APPEND` commit logs (Postgres is the log).
- Kafka / NATS at current scale.
- Async business transactions (sales, stock, receipts).
- **Redis / any shared L2 cache** (2026-07-26). Every cache here is process-local.
  Multi-instance deployments accept staleness up to the TTL; revisit if horizontal
  scaling makes that bound unacceptable.

## Risks accepted

| Risk | Mitigation |
|------|------------|
| Stale permissions | TTL (default 30s) + explicit cache invalidation on every permission, role, and staff write |
| Multi-instance staleness up to TTL | Documented, unchanged in practice by the revision-check removal; Redis deferred |
| Role `apply_user_scopes` edit not applied | `patchRole` invalidates all members of the role |
| Platform staff deactivated | `patchStaff` invalidates that identity |
| Activity write throttle vs idle logout | Throttle (30s) is orders of magnitude below `SESSION_IDLE_MINUTES` (20m); idle is still decided by the DB timestamp |
| Setup cache serving stale "ready" | 15s TTL; only positives cached |
| Audit loss on crash (async tier) | Shutdown flush; sync tier for critical codes |
| CSV all-or-nothing after validation | Documented in baseline doc |

## References

- [baseline-and-targets.md](../performance/baseline-and-targets.md)
- [environment-variables.md](../runbooks/environment-variables.md)
