# Performance baseline and targets

**Last updated:** 2026-06-23  
**Plan:** ERP Performance Hardening v2

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

## Risks accepted

- **Auth cache:** up to `AUTH_CACHE_TTL_SECONDS` (default 30s) staleness if invalidation missed; mitigated by `auth_revision` bump.
- **Async audit:** non-critical events may lag ≤75ms; up to one batch lost on `kill -9` before flush.
- **CSV import:** valid rows commit atomically; validation errors reported per row before TX.

## Baseline log (fill after Phase 0 on your machine)

| Route id | p50 (ms) | p95 (ms) | Date | Notes |
|----------|----------|----------|------|-------|
| inventory.items.list | | | | |
| sales.list | | | | |
