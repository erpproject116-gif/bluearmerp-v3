# UI coverage — route & interaction smoke

Living checklist for proving Bluearm ERP screens load and critical nested controls work. Hybrid Phase 1: **Vitest shared controls** + **Playwright CRUD/interaction journeys**. See also `docs/qa/ui-coverage.md` and `docs/qa/live-e2e-baseline.md`.

## Static gates (no browser needed)

- **Link integrity** — `src/routes/linkIntegrity.test.ts` (runs with `npm test`): every
  hardcoded `/app/...` string in `web/src` must resolve to a route declared in `App.tsx`.
  Routes are re-extracted at test time via `e2e/scripts/extract-app-routes.mjs` (shared
  module), so route renames immediately fail files still linking to old paths.
- **Coverage manifest** — `npm run e2e:coverage:manifest` then `e2e/coverage-manifest.spec.ts`
  ensures every smokeable route is inventoried.

## Live safety tiers

| Tier | When | Behavior |
|------|------|----------|
| `read-only` | Default live | Mutation guard aborts business POST/PUT/PATCH/DELETE |
| `reversible` | Opt-in | Create **only** `E2E-*` records; never edit first production row |
| `posting` | Opt-in | Post `E2E-*` docs after reversal path proven |

```bash
# Live read-only (safe default)
set CI=true
set E2E_BASE_URL=https://app.bluearmerp.com
npm run test:e2e:live:read-only

# Save this account's storageState once (gitignored)
npm run test:e2e:auth:save
```

External `E2E_BASE_URL` **does not** start local Vite.

## Route smoke behavior

- Any **API 5xx** during a route visit fails that route with method + endpoint in the message.
- **API 4xx** (except 401) are logged as `[route-smoke]` warnings — visible but non-fatal.
- **429 rate limiting** (deployed API: ~200 authenticated req/min/user) is detected and the
  runner waits out the window once before declaring the API down. Full-mode timeout is 60 min.
- Live runs add inter-route pacing (`E2E_ROUTE_PACE_MS`, default 450ms on app.bluearmerp.com).
- Run against a deployed environment with `E2E_BASE_URL=https://app.bluearmerp.com`
  (demo credentials or `e2e/.auth/user.json` must exist there).

## Prerequisites

Authenticated e2e needs **either**:

1. `e2e/.auth/user.json` from `npm run test:e2e:auth:save`, or
2. Demo email/password / `E2E_BENCH_TOKEN`, **and** for local API the demo Auth user linked to tenant `DEMO000`.

Tenant lookups (partner/item/location/open POs) come from `e2e/fixtures/tenant-profile.json`
or `E2E_TENANT_PROFILE` / `tenant-profile.local.json` (gitignored).

## Commands

```bash
cd bluearmerp-v3/web

npm test
npm run test:unit
npm run test:e2e                    # chromium project (full local/CI)
npm run test:e2e:live:read-only
npm run test:e2e:live:reversible    # requires mutation env flags
npm run test:e2e:live:posting
npm run test:e2e:core-interactions
npm run test:e2e:routes:full
npm run e2e:routes:extract
npm run e2e:coverage:manifest
npm run e2e:tickets:draft           # review before submit
npm run e2e:report
```

Env:

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Default `http://localhost:5173` |
| `E2E_DEMO_PASSWORD` | Local/live demo password (`web/.env.local`) |
| `E2E_BENCH_TOKEN` | CI bench JWT |
| `E2E_FULL_ROUTE_SMOKE=1` | Visit all smokeable routes |
| `E2E_TIER` | `read-only` \| `reversible` \| `posting` |
| `E2E_ALLOW_MUTATIONS=1` | Required with non-read-only tier |
| `E2E_RUN_CONFIRM` | Run id for markers + mutation confirm |

## Interaction helpers

| Helper | File | Usage |
|--------|------|--------|
| `openNewRow`, `fillLookup`, `fillDate`, … | `e2e/helpers/entityForm.ts` | Drive form controls |
| `defineDocCrudSpec` | `e2e/helpers/docCrud.ts` | Read-only cancel + gated create |
| `installMutationGuard` | `e2e/helpers/liveSafety.ts` | Block writes on live read-only |
| Soft-skip / incomplete | `softSkip` / `noteIncomplete` | **Throw** with annotations — never silent pass |
| Mutation ledger | `e2e/helpers/mutationLedger.ts` | Tracks `E2E-*` creates |

`core-interactions.spec.ts` opens each core New transaction, checks the modal
action contract, edits and restores an enabled field/checkbox, exercises
Details/Invoice tabs when present, invokes empty-form validation, and closes
the modal. Business mutations are intercepted, so the suite does not create,
update, or delete ERP records.

### Demo seed helpers (GR / PR)

```bash
psql "$DATABASE_URL" -f scripts/reset-demo-po-gr-open.sql
psql "$DATABASE_URL" -f scripts/seed-demo-purchase-requests.sql
```

Phase 2 modules: `npx playwright test e2e/phase2-modules.spec.ts --project=chromium`

Unique values use `E2E-{runId}` via `e2eMarker()` / `uniqueToken()`.

## Artifacts

| File | Role |
|------|------|
| `e2e/fixtures/app-routes.json` | Generated route inventory |
| `e2e/fixtures/coverage-manifest.json` | Per-route coverage map |
| `e2e/fixtures/tenant-profile.json` | Lookup fixtures |
| `e2e/.auth/user.json` | Gitignored storageState |
| `e2e/.evidence/<run>/` | Ledger, UX metrics, ticket drafts |
| `docs/qa/live-e2e-run-report.md` | Latest generated report |

## Support tickets

1. Failures + UX friction → `npm run e2e:tickets:draft`
2. Review/dedupe via Support list/export
3. Submit only with `E2E_SUBMIT_TICKETS=1` + bearer/tenant (`e2e/scripts/submit-support-tickets.mjs`)

## Regenerating after route changes

```bash
npm run e2e:routes:extract
npm run e2e:coverage:manifest
```

Commit updated fixtures. Add high-traffic paths to `CORE_APP_ROUTES` in `e2e/helpers/appRoutes.ts`.
