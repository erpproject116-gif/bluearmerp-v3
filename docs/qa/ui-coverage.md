# UI coverage — route, contracts, chains, live safety

Living checklist for proving Bluearm ERP screens load and critical nested controls work.

**Authoritative inventory:** regenerate with:

```bash
cd web
npm run e2e:routes:extract
npm run e2e:coverage:manifest
```

See `e2e/fixtures/app-routes.json` and `e2e/fixtures/coverage-manifest.json`.
Baseline freeze: [`docs/qa/live-e2e-baseline.md`](live-e2e-baseline.md).

## Hybrid coverage

1. **Vitest** — shared controls + link integrity
2. **Playwright read-only** — route smoke, core interactions, page/grid/form contracts, history, UX tasks, business-chain surfaces
3. **Playwright reversible** — `E2E-*` creates only (`E2E_TIER=reversible`, `E2E_ALLOW_MUTATIONS=1`, `E2E_RUN_CONFIRM=<id>`)
4. **Playwright posting** — GR post etc. (`E2E_TIER=posting` + same confirm)
5. **Support tickets** — draft → review/dedupe → submit (never auto-submit)

## Commands

```bash
cd bluearmerp-v3/web

npm test
npm run test:e2e:live:read-only
npm run test:e2e:auth:save          # once: headed login → e2e/.auth/user.json
npm run test:e2e:routes:full
npm run e2e:tickets:draft
npm run e2e:report
```

Live reversible (explicit):

```bash
set E2E_BASE_URL=https://app.bluearmerp.com
set E2E_TIER=reversible
set E2E_ALLOW_MUTATIONS=1
set E2E_RUN_CONFIRM=run-20260916-1
npm run test:e2e:live:reversible
```

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Default `http://localhost:5173`; set to `https://app.bluearmerp.com` for live |
| `E2E_TIER` | `read-only` (default) \| `reversible` \| `posting` |
| `E2E_ALLOW_MUTATIONS` | Must be `1` with tier to create/post |
| `E2E_RUN_CONFIRM` | Run id required for mutations; used in `E2E-*` markers |
| `E2E_TENANT_PROFILE` | Optional path to tenant lookup JSON |
| `E2E_DEMO_PASSWORD` | Password auth when no storageState |
| `E2E_BENCH_TOKEN` | CI bench JWT |
| `E2E_FULL_ROUTE_SMOKE=1` | All smokeable routes |

## Module checklist (high level)

| Module | Route smoke | Contracts | History | CRUD/chains |
|--------|:-----------:|:---------:|:-------:|:-----------:|
| Inventory | manifest | page-grid-form + chains | | partners/items gated |
| Quotation / SO / Sale | core | contracts + selling chain | e2e | docCrud gated |
| PR / PO / GR / Purchases | core | buying chain | e2e | GR posting gated |
| OR / PV / Finance | core | accounting chain | OR | phase2 + OR gated |
| UX tasks | | end-user-ux | | friction → ticket drafts |

## DoD per feature

1. Path in `app-routes.json` + `coverage-manifest.json` after extract.
2. Read-only contract or intentional `role-gated` / `needs-seed` annotation (fail, not silent pass).
3. P0 flows: reversible create uses `E2E-*` + mutation ledger only.
4. Findings: Support ticket draft → dedupe → submit; never edit first production row.
5. Shared controls: Vitest where touched.
