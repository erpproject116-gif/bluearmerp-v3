# UI coverage — route & interaction smoke

Living checklist for proving Bluearm ERP screens load and critical nested controls work.

**Hybrid coverage:**

1. **Vitest + Solid Testing Library** — shared controls under `web/src/shared/*.test.tsx`
2. **Playwright Phase 1** — transaction + inventory + after-sales CRUD/History
3. **Playwright Phase 2** — CRM leads, COA, journal, RFQ, payment vouchers, PR History (`e2e/phase2-modules.spec.ts`)

## Commands

From `bluearmerp-v3/web`:

```bash
npm test
npm run test:e2e

# Phase 2 only
npx playwright test e2e/phase2-modules.spec.ts

# GR receive (needs open DEMOGR902/903)
npx playwright test e2e/goods-receipt-receive.spec.ts
```

Re-open GR demo seed (local DB):

```bash
psql "$DATABASE_URL" -f scripts/reset-demo-po-gr-open.sql
# ensure PRs for History:
psql "$DATABASE_URL" -f scripts/seed-demo-purchase-requests.sql
```

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Default `http://localhost:5173` |
| `E2E_DEMO_PASSWORD` | Local demo password |
| `E2E_BENCH_TOKEN` | CI bench JWT |
| `E2E_FULL_ROUTE_SMOKE=1` | All smokeable routes |

## Module checklist

| Module | Route smoke | History | Interaction/CRUD | Notes |
|--------|:-----------:|:-------:|:----------------:|-------|
| Inventory partners/items | core | | Phase 1 e2e | |
| Quotation / SO / Sale | core | e2e | Phase 1 e2e | |
| Purchase request | core | e2e | Phase 2 | seed `seed-demo-purchase-requests.sql` |
| PO / RFQ / GR | core | PO | PO + RFQ + GR | GR: reset script / seed reopen |
| Purchases / OR / PV | core | e2e | Phase 1 OR + Phase 2 PV | |
| Finance COA / JE | core | | Phase 2 | |
| CRM leads | | | Phase 2 | |
| After-sales | | | Phase 1 | |

## DoD per feature

1. Route in `app-routes.json` after extract.
2. Core smoke or intentional skip.
3. Transaction modals: History covered.
4. P0 flows: Phase 1/2 Playwright journey when changed.
5. Shared controls: Vitest where touched.
