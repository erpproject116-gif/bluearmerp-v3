# Performance baseline and targets

**Last updated:** 2026-07-26  
**Plan:** ERP Performance Hardening v2 → DB Hit Reduction (no Redis)

## Targets

| Environment | p95 ceiling | Routes file | Token required |
|-------------|-------------|-------------|----------------|
| Local dev | 400 ms | `scripts/perf/routes.core.json` | Yes (mint or app sign-in) |
| CI (GitHub Actions) | 800 ms | same | Yes (`mint-bench-jwt.mjs`) |
| CI health-only smoke | 2000 ms | same (unauthenticated) | No |

## How to run

```bash
# Start API + seeded DB, then:
node scripts/mint-bench-jwt.mjs   # copy token
BENCH_TOKEN=<jwt> node scripts/bench-api.mjs

# CI-equivalent:
BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs) BENCH_P95_MAX_MS=800 BENCH_ITERATIONS=5 node scripts/bench-api.mjs
```

Bench uses **2 warmup iterations** per route before sampling (override with `BENCH_WARMUP`).

## Routes under test

See [scripts/perf/routes.core.json](../../scripts/perf/routes.core.json) — inventory lists, sales, CRM tasks, activity changes, finance receipts.

Write smoke (local only): [scripts/perf/routes.write.json](../../scripts/perf/routes.write.json).

## Phase acceptance gates

| Phase | Gate |
|-------|------|
| 0 | Bench green at targets above |
| 1 | Auth cache: warm inventory list p95 −30–50% vs pre-cache baseline |
| 2 | Partner PATCH faster; finance receipt audit visible in same request |
| 3 | 500-row CSV import &lt; 3s local Docker |
| 4 | No pool exhaustion under extended bench |
| 5 | Attachment download 404 cross-tenant |
| 6 | Duplicate CRM job run does not duplicate notifications |
| 7 | Large export smaller on wire; list p95 ±5% |

## DB-hit reduction pass (2026-07-26, no Redis)

A warm authenticated GET used to run the idle-session SELECT plus an `auth_revision`
SELECT, a `platform_users` SELECT and UPDATE, and a `tenant_roles` SELECT before the
handler's own query. It now runs the idle SELECT, one cache hit, and (only when
`X-Branch-ID` is present) one branch validation. Mutating routes additionally reuse
30s/15s caches for entitlement, module enablement, and setup readiness instead of
re-running those checks — setup readiness in particular fanned out across a dozen
foundation tables on every blocked-path write.

On the client: the 14 transactional list hooks dropped `staleTime: 0` and inherit the
global 30s, the shell polls CRM notifications once instead of twice, presence and
usage heartbeats stop POSTing while the tab is hidden, and mutation invalidation no
longer fires each affected list twice.

Everything is process-local. See [ADR 0004](../adr/0004-performance-patterns.md) §8–9
for the caches and their kill switches; Redis is explicitly deferred.

## Manual verification checklist

1. Warm `/api/v1/auth/me`, then a list GET, and count queries (`pg_stat_statements` or
   API logs): the `auth_revision`, `platform_users`, and `tenant_roles` reads should be
   gone from the warm path.
2. Toggle a module under Modules & Features, then immediately attempt a write in that
   module — the gate must reflect the new state on the first request, not after 30s.
3. Suspend a customer in Command Center, then attempt a tenant write — blocked without
   waiting out the TTL.
4. Hide the browser tab for two minutes with the app open: no `/usage/events` or
   `/presence/` POSTs in the network log. Restoring the tab pulses once.
5. Open a list, switch away and back within 30 seconds: no refetch.
6. Save a document: the list updates exactly once (one request, not two).
7. Stay signed in and idle past `SESSION_IDLE_MINUTES`: idle logout still fires.

## Risks accepted

- **Auth cache:** up to `AUTH_CACHE_TTL_SECONDS` (default 30s) staleness. A live hit is
  trusted for the full TTL; correctness rests on invalidation at every permission,
  role, and staff write, not on a per-request revision check.
- **Tenant gating caches:** entitlement and module answers up to 30s stale, setup
  readiness up to 15s, on instances that did not process the write.
- **Lists at 30s staleTime:** another user's edit can take up to 30s to appear. The
  actor's own save still refreshes immediately via mutation invalidation.
- **Async audit:** non-critical events may lag ≤75ms; up to one batch lost on `kill -9` before flush.
- **CSV import:** valid rows commit atomically; validation errors reported per row before TX.

## Baseline log (fill after Phase 0 on your machine)

| Route id | p50 (ms) | p95 (ms) | Date | Notes |
|----------|----------|----------|------|-------|
| inventory.items.list | | | | |
| sales.list | | | | |
