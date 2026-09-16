# Buy path — Cordova (tenant 32) runbook

Fact-based checklist for **Purchase Order → New Purchases → inventory / serials → accounting**.
Automation that mirrors this lives in:

- [`web/e2e/buy-path-new-purchases.spec.ts`](../../web/e2e/buy-path-new-purchases.spec.ts) (P0 — GL proof)
- [`web/e2e/goods-receipt-receive.spec.ts`](../../web/e2e/goods-receipt-receive.spec.ts) (P1 — serial/lot station)
- Helpers: [`web/e2e/helpers/buyPath.ts`](../../web/e2e/helpers/buyPath.ts)

Tenant fixtures (local, gitignored): copy [`tenant-profile.json`](../../web/e2e/fixtures/tenant-profile.json) → `tenant-profile.local.json`. Cordova values used in QA:

| Field | Value |
|-------|-------|
| Tenant | Cordova Computer Hub / `TRIAL-90f0ad` / id **32** |
| Supplier | Visayas Tech |
| Serial item | USB-C 65W Laptop Charger (`track_serial=true`, has `base_unit_id`) |
| Location | Cordova |
| Example confirmed PO | `260913001` (may be fully received — refresh `openPoCodes` after each run) |

## Preflight (read-only)

1. App: https://app.bluearmerp.com — confirm tenant code **TRIAL-90f0ad**.
2. Progress / Fulfillment on PO list set to **All**; tab **List** (not Open POs alone).
3. Run or manually verify: every trade item has a **base unit** (missing unit → PO save 400).
4. `/health/schema` on the API is healthy.

## P0 — New Purchases (stock + AP + GL together)

Stamp every document with a run marker, e.g. `E2E-BUY-20260916-1`.

1. **Purchase Orders** → New → vendor Visayas Tech → line USB-C qty 1 → Reference/Notes = marker → Save.
2. Confirm the PO (list Confirm). Status becomes confirmed / progress completed.
3. **Purchases** (`/app/purchases/purchase-receive`) → New Purchases → **Load Slip → Purchase Order** → select that PO.
4. If the line tracks serials: open serial cell → **Paste serials** → one serial `E2E-BUY-…-SN01` → Import.
5. Save the purchase (starts Unconfirmed).
6. On the Purchases list, set **Progress → Completed** (this posts stock + supplier bill + GL).

### Prove accounting (do not stop at a toast)

| Check | Where |
|-------|--------|
| Serial on hand | Inventory → Serial registry — search marker prefix |
| Open AP | Finance → Accounts Payable — bill for Visayas Tech |
| Journal posted | Finance → Journal entries — SI must have `invoice_journal_entry_id` / posted JE |

Automation asserts the same via API after Completed.

## P1 — Serial/lot receive station (secondary)

1. Confirm a PO still open for receive; put `purchase_order_no` in `openPoCodes`.
2. `/app/inventory/serial-lot/receive` → pick PO → Create goods receipt → Paste serials → **Post goods receipt**.
3. History under Purchases shows **Posted**; serial registry shows the prefix.
4. GR posts inventory GL and *may* auto-create a purchase invoice. **Do not treat GR post alone as full AP/GL proof** — that is P0 Completed.

## Live automation (manual workflow only)

```bash
# From web/, with storage state or bench credentials for tenant 32:
export E2E_BASE_URL=https://app.bluearmerp.com
export E2E_TIER=posting
export E2E_ALLOW_MUTATIONS=1
export E2E_RUN_CONFIRM=E2E-BUY-YYYYMMDD-N   # fresh each run
export E2E_EXPECT_TENANT_CODE=TRIAL-90f0ad
export E2E_REQUIRE_AUTH=1

npx playwright test --project=posting \
  e2e/master-preflight.spec.ts \
  e2e/buy-path-new-purchases.spec.ts \
  e2e/goods-receipt-receive.spec.ts

npm run e2e:reconcile -- --reverse
```

Or GitHub Actions: workflow **E2E live mutating** (`workflow_dispatch`) with the same specs, then download the evidence artifact and reconcile.

## Stop conditions

- Wrong tenant / auth loss
- Mutation without `E2E-` marker
- Schema unhealthy
- Reconcile reports leftover `E2E-*` rows

## Related

- [`live-e2e-baseline.md`](live-e2e-baseline.md)
- [`live-e2e-release-gates.md`](live-e2e-release-gates.md)
