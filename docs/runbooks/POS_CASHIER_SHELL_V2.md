# POS cashier shell v2 ‚Äî Phase 0 decisions & void spike

**Flag:** `pos_cashier_shell_v2` (web: `POS_CASHIER_SHELL_V2` in `web/src/modules/pos/posShellV2.ts`).  
Read **once at mount** (module load). Default **off** until staging pilots pass.

Enable locally: `localStorage.setItem("pos_cashier_shell_v2","1")` then reload, or `VITE_POS_CASHIER_SHELL_V2=true`.

---

## D14 ‚Äî PWA install target (confirmed)

**Decision: in-app Add-to-Home-Screen coach for `/app/pos` ‚Äî do not change `start_url` to `/app/pos`.**

Observed (`web/vite.config.ts`): one manifest, `start_url: "/app/production"`, ERP-wide install.

Changing `start_url` to POS would break floor/production installs. A parallel POS-only manifest is out of scope (one origin). Phase 6 ships an in-POS install coach; optional later: `/app` launcher tile that deep-links POS without rewriting `start_url`.

---

## D15 ‚Äî Shift diary (confirmed)

**Decision: session-scoped real-time activity feed + end-of-shift report (Z summary + transaction annex with `sales_no`) in Phase 3b.**

No separate ‚Äúdiary‚Äù product. No revenue JE on shift close, cash in/out, or coin exchange. Print/PDF from the same snapshot. Daily rollup is ops reporting only.

---

## Void-last spike (Phase 0) ‚Äî design required before P1b

### Contracts (master plan)

- Reversal only ‚Äî **no hard-delete** of `sa_sales` / tenders / movements.
- Permission (and PIN when product adds it) + audit log.
- Block when Finance **OR applications** exist (same gate as sales invoice void).
- Restore stock / serials / lots; reverse or cancel related JE when posted.

### Observed gaps (repo)

| Path | Behavior | Gap for POS void |
|------|----------|------------------|
| Checkout stock | `ApplyStockDelta(..., "pos_checkout", salesID, "sales")` in `pos/sessions.go` | Movements keyed `ref_type=pos_checkout`, `ref_id=sales_id` |
| `reverseSaleStock` | Joins `ref_type='sa_sales_line'` only | **Does not restore POS qty** |
| `POST /sales/{id}/void` | Accounting voucher void only; comment: leaves stock/serials/lots | Not a register void |
| OR blocker | `fin_receipt_applications` on sales void | Keep for POS void-last |

### Recommended P1b design (implemented)

1. **`POST /api/v1/pos/sessions/{id}/void-last`** (open session; last tender‚Äôs sale only).
2. In one tx: reverse exclusive auto-ORs (multi-invoice OR still blocks) ‚Üí `sales.ReverseCompletedSaleInventory` (includes `pos_checkout`) ‚Üí void commission + SI journals ‚Üí soft-delete `sa_sales` + lifecycle audit ‚Üí decrement `pos_sessions.sales_total`.
3. Session report tenders exclude voided sales.
4. UI (shell v2): Void on Sale Complete + More ‚Üí Void last sale.

**OR rule:** ORs applied only to this sale are reversed with the void. ORs shared with other invoices still block (Finance unapply first).

---

## Phase 1 shipped behind flag

- Cashier ERR map (`posCashierCopy.ts`)
- `SaleCompletePanel` ‚Äî honest ‚ÄúSale recorded‚Äù / paid / OR pending + void confirm
- `PosMoreMenu` ‚â§4; hide Manage on terminal
- Responsive: `lg+` split; `<lg` bottom cart sheet + sticky Pay; safe-area / `dvh`
- Payment modal stays; success path uses Sale Complete when flag on
- **P1b:** void-last API + UI
## Phase 2 ó Receipt slip (flagged)

- Checkout returns structured `receipt_format` (not an HTML builder).
- Title is **Sales slip** unless Finance OR# is present ? **Official Receipt**.
- `PosReceiptSlip` screen preview + browser print; reprint from session recent checkouts.
- Screen fallback builds a totals-only slip if snapshot missing.

## Phase 3 ó Cash drawer + close variance

- Cash in/out via existing `pos_cash_movements` (no revenue JE).
- `coin_exchange` movement type (migration 314): audited, **excluded** from `expected_cash`.
- Session report returns `coin_exchange`, `variance` when closed.
- UI: More ? Cash drawer; close shift shows variance + coin-exchange note.

## Phase 3b ó Shift diary (activity + Z + daily)

- `GET /api/v1/pos/sessions/{id}/activity` ó session-scoped feed (sales/voids/cash movements).
- `GET /api/v1/pos/sessions/{id}/z-report` ó end-of-shift summary + transaction annex (`sales_no`); same `expected_cash` rules (coin exchange excluded); **no revenue JE**.
- `GET /api/v1/pos/reports/daily?date=YYYY-MM-DD&location_id=` ó ops rollup (`pos.manage` read).
- UI (flag): More ? Shift activity (poll); More ? End-of-shift report (Z print + Daily tab).

## Phase 4 ó Catalog curation + stock badges

- Migration `315_pos_catalog_visible.sql`: `inv_items.pos_visible` (default true).
- Catalog `GET /pos/catalog/items?location_id=&stock=` returns `qty_available`, `stock_status` (ok|low|sold_out|untracked), `is_top_seller` (30d location sales, top 12).
- Low = qty = `reorder_level` (or default 5). Sold out tiles dimmed / blocked.
- `PATCH /pos/catalog/items/{id}/visibility` (pos.manage write). Manage Products ? On POS checkbox.
- UI (flag): All / In stock / Low / Top chips + Sold out / Low / Top badges.

## Phase 5 ó Scan & stocking boundary

- Scan resolver: exact `item_code` ? single partial hit ? serial `resolve-scan`; ambiguous ? pick from grid (no auto-add).
- Placeholder: ìReady to scanÖî; focus returns after scan; miss toast.
- Qty on tiles from Phase 4 (read-only on-hand).
- More ? Open Inventory / Print barcodes (deep-link `/app/inventory/items`); **no stock-in on terminal**.

## Phase 6 ó Held bills, offline honesty, restaurant, PWA coach

- Saved bills copy (`save_bill` / `bills` labels); hold prompt plain language.
- Offline: device-offline banner; queue honesty; failed checkout removals warn to re-ring; `add_line` queue entries dropped (not expanded).
- Retail profile (default): hide tip/table/per-guest F&B; restaurant profile keeps them.
- `PosInstallCoach` on terminal (D14) ó does **not** change PWA `start_url`.

## Phase 7 ó Hardening & docs

- Flag remains **default off** until staging pilots pass (`posShellV2.ts`).
- KB: `pos-first-day-register` (Documentation ? Point of Sale).
- Large `PosPage` split deferred until pilot; components already extracted (SaleComplete, Receipt, Cash drawer, Activity, Z, Install coach, scan helper).
- Migrations to apply on deploy: `314_pos_coin_exchange`, `315_pos_catalog_visible`.

### E2E smoke

`npx playwright test e2e/pos-cashier-shell.spec.ts` (needs demo auth + catalog/location). Annotates `needs-seed` when setup is incomplete.
