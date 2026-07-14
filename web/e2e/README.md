# UI coverage — route & interaction smoke

Living checklist for proving Bluearm ERP screens load and critical nested controls work. Hybrid Phase 1: **Vitest shared controls** + **Playwright CRUD/interaction journeys**. See also `docs/qa/ui-coverage.md`.

## Prerequisites

Authenticated e2e needs **both**:

1. Vite web (`npm run dev` on `:5173`)
2. Go API (`cd api && go run ./cmd/server` on `:8080`)

Authenticated e2e also requires the demo Auth user to be **linked** to tenant `DEMO000`:

```bash
psql "$DATABASE_URL" -v auth_uuid="'d4ca1577-e851-49d0-b51d-d0931308e170'" -f scripts/link-demo-auth-user.sql
```

Without this link, `/app/*` shows “Account not provisioned yet” and grids never appear.

## Commands

```bash
cd bluearmerp-v3/web

# Shared Modal / LookupCombo / DateInput / … (jsdom)
npm test
npm run test:unit

# Full Playwright suite (route smoke + History + CRUD interactions)
npm run test:e2e

# Core route list only
npx playwright test e2e/route-smoke.spec.ts

# Full static /app map (~200 paths)
npm run test:e2e:routes:full

# Nested History regression
npx playwright test e2e/transaction-history.spec.ts

# Document / master-data interaction journeys
npx playwright test e2e/*-crud.spec.ts e2e/inventory-partners-items.spec.ts e2e/after-sales-repair.spec.ts
```

Env:

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Default `http://localhost:5173` |
| `E2E_DEMO_PASSWORD` | Local demo password (`web/.env.local`) |
| `E2E_BENCH_TOKEN` | CI bench JWT |
| `E2E_FULL_ROUTE_SMOKE=1` | Visit all smokeable routes |

## Interaction helpers

| Helper | File | Usage |
|--------|------|--------|
| `openNewRow`, `fillLookup`, `fillDate`, `selectByLabel`, `saveEntityModal`, `addItemLine` | `e2e/helpers/entityForm.ts` | Drive form controls |
| `defineDocCrudSpec` | `e2e/helpers/docCrud.ts` | Shared cancel / edit / create journey |
| Soft-skip | `softSkip` | Setup only (no table) — marks test skipped |
| Incomplete create | `noteIncomplete` | After Cancel/Edit passed — annotates, still **passes** |

### Demo seed helpers (GR / PR)

```bash
# Re-open DEMOGR902 after e2e receive (surgical — not a full purge)
psql "$DATABASE_URL" -f scripts/reset-demo-po-gr-open.sql

# Ensure DEMOPR201/202 exist for PR History
psql "$DATABASE_URL" -f scripts/seed-demo-purchase-requests.sql
```

Phase 2 modules: `npx playwright test e2e/phase2-modules.spec.ts`

Unique values use `E2E-{timestamp}` via `uniqueToken()`.

## Artifacts

| File | Role |
|------|------|
| `src/shared/*.test.tsx` | Shared control component tests |
| `e2e/fixtures/app-routes.json` | Generated route inventory |
| `e2e/helpers/appRoutes.ts` | Core route list + visit helpers |
| `e2e/helpers/entityForm.ts` | Form interaction helpers |
| `e2e/helpers/docCrud.ts` | Document CRUD template |
| `e2e/*-crud.spec.ts` | Quotation, SO, Sale, PO, Purchase, OR |
| `e2e/inventory-partners-items.spec.ts` | Partners + Items |
| `e2e/after-sales-repair.spec.ts` | Repair orders |
| `e2e/route-smoke.spec.ts` | Route load / no `pageerror` |
| `e2e/transaction-history.spec.ts` | History above entity modal |

## Module checklist

| Module | Route smoke | History | Interaction/CRUD |
|--------|:-----------:|:-------:|:----------------:|
| Inventory partners/items | core | | e2e |
| Quotation | core | e2e | e2e |
| Sales order | core | e2e | e2e |
| Sales (SI) | core | e2e | e2e |
| PO | core | e2e | e2e |
| Purchases | core | e2e | e2e |
| Official receipts | core | e2e | e2e |
| After-sales repair | smoke | | e2e |
| GR receive | | | deep e2e (soft-skip if seed used) |

## Regenerating after route changes

```bash
npm run e2e:routes:extract
```

Commit updated `e2e/fixtures/app-routes.json`. Add high-traffic paths to `CORE_APP_ROUTES` in `e2e/helpers/appRoutes.ts`.
