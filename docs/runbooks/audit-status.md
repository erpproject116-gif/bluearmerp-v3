# Audit & performance status

**Last updated:** 2026-06-23  
**Scope:** Gap/correctness hardening + lean/perf baseline (autonomous pass).

## UX / nav redundancy pass (2026-06-23)

| Issue | Fix |
|-------|-----|
| Sidebar "Dashboard" vs CRM/Operations dashboards | Sidebar label → **Business Dashboard** (matches migration 049) |
| Report Catalogue tab duplicated Reports sidebar module | Removed from dashboard header tabs |
| Header "New *" tabs duplicate list **+ New row** | Removed `/new` routes from header feature tabs |
| Long prefixed tab labels ("Sales Order List") | Short labels: **List**, **Status**, **Pick list**, etc. |
| CRM / Operations generic "Dashboard" tab | **My pipeline** / **Project dashboard** |
| Data Center "Inbox" vs Communications Inbox | **Import inbox** |
| Purchases vs Supplier Invoices naming | Module label **Supplier Invoices**; finance tab aligned |
| Workspace pages repeated "X workspace" under header **Workspace** | Titles removed; kept tenant + helper text only |
| GR list / Pick list page H2 duplicated shell header | Page titles removed; description only |
| Single-feature modules showed pointless header tab | `visibleHeaderFeatures()` hides lone landing tab |
| Finance header crowded with report tabs | Report paths removed from header; reach via **Finance workspace** or **Reports** |
| Inventory header report tabs duplicate Stock workspace | `/reports/` paths hidden from inventory header |
| Sales long tab labels | Shortened: **Price batch**, **Discount status**, **Print slips**, **Commissions** |
| Sales AR/credit reports only under Finance | Moved **SI receipts**, **Customer credit**, **AR by customer** to Sales module tabs |
| Selling cockpit not in sidebar | **Selling** module in Selling nav group (mirrors **Buying** in procurement) |
| Delivery notes / serial-lot list H2 duplicated header | Removed page H2 on DR list, serial movements, lot batches |
| Sales return-lines API had no modal entry point | **Return lines** on edit Sale modal → `POST /api/v1/sales/{id}/return-lines` |
| Date-based demo doc numbers broke cross-seed lookups | Stable demo refs: `DEMOSO101/102`, `DEMOSI201`, `DEMOFIN301`, `DEMOQUO001/002/ARC/PRT/LAB`, `DEMOPR201/202` |

Files: `web/src/shell/modules.ts`, `AppShell.tsx`, workspace pages, `GoodsReceiptListPage`, `ReleaseSalesOrderPage`, `DeliveryReceiptListPage`, `SerialMovementsListPage`, `LotBatchesListPage`.

## Completed in this pass

| Area | Change |
|------|--------|
| **GR reverse UI** | `GoodsReceiptListPage` — Reverse button on posted rows (`purchase_order.goods_receipts_reverse`) |
| **SO release undo UI** | `ReleaseSalesOrderPage` — Recent releases table + Undo (`sales_order.release_undo`) |
| **Recent releases API** | `GET /api/v1/sales-order/sales-orders/recent-releases` |
| **Deep-link guard** | `ModuleAccessGate` in `AppShell` — module + permission check with Help fallback |
| **Member GR post** | Migration `154_member_gr_post_write.sql` — `member` gets write on `goods_receipts_post` |
| **Stable serial demo seed** | `seed-demo-serial-lot.sql` — `DEMOSER901` / `DEMOPRGR01`, stable serials, sequential GR line_no |
| **Auto-seed** | `supabase/config.toml` includes `seed-demo-serial-lot.sql` after `po-gr-open` |
| **Golden smoke POST** | `GOLDEN_CREATE_GR=true` creates draft GR from `DEMOGR902` (or first PO) |
| **Perf/golden routes** | Extended `routes.core.json` and `routes.golden.json` (dashboard, reconciliation, release queue) |
| **Serial-lot README** | Hybrid stock table aligned with legacy vs split + DR; demo PO notes |
| **Tests** | `goods_receipt_lines_test.go`, `dashboard_test.go`; fixed `resolve_serial_test` nil-pool panic |
| **Documentation** | This runbook |

## Verification commands

```bash
# API
cd api && go test ./internal/modules/goodsreceipt/ ./internal/modules/dashboard/ ./internal/modules/inventory/ -count=1
cd api && go build ./...

# Web
cd web && npm run build
cd web && npx playwright test e2e/goods-receipt-receive.spec.ts   # needs API + seeds + E2E_BENCH_TOKEN or E2E_DEMO_PASSWORD

# Golden smoke (API running + seeded DB)
export API_BASE=http://localhost:8080
export BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs)
node scripts/golden-path-smoke.mjs
GOLDEN_CREATE_GR=true node scripts/golden-path-smoke.mjs

# Perf bench (warm)
BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs) node scripts/bench-api.mjs
```

## Re-seed after pull

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-inventory.sql
psql "$DATABASE_URL" -f scripts/seed-demo-quotations.sql
psql "$DATABASE_URL" -f scripts/seed-demo-sales-orders.sql
psql "$DATABASE_URL" -f scripts/seed-demo-sales.sql
psql "$DATABASE_URL" -f scripts/seed-demo-finance.sql
psql "$DATABASE_URL" -f scripts/seed-demo-crm.sql
psql "$DATABASE_URL" -f scripts/seed-demo-po-gr-open.sql
psql "$DATABASE_URL" -f scripts/verify-demo-po-gr-open.sql
psql "$DATABASE_URL" -f scripts/seed-demo-serial-lot.sql
```

Restart API after migration **154**.

## Manual smoke checklist

1. **Receive** — `/app/inventory/serial-lot/receive` → PO `DEMOGR902` → scan → post (member role).
2. **GR reverse** — Goods Receipt List → posted demo GR → Reverse (store admin).
3. **Release undo** — Release Sales Order → release a line → Recent releases → Undo.
4. **Access gate** — deep-link `/app/dashboard` as member without `dashboard` permission → blocked screen.
5. **Reconciliation** — `/app/inventory/stock-reconciliation` → summary loads.
6. **Return lines** — Sales list → open `DEMOSI201` → **Return lines** → remove a line (store admin / `sales.sales_return` write).
7. **Selling workspace** — Sidebar **Selling** → KPI tiles load; **Sales Status** / **Receivable Status** tabs reachable.
8. **GR E2E (CI)** — `e2e/goods-receipt-receive.spec.ts`: DEMOGR902 → paste 5 serials → post → list shows Posted.

## Known remaining gaps (not in this pass)

| Priority | Item |
|----------|------|
| P1 | Inline `POST /sales/{id}/return-lines` UI on Sales modal | **Done** — `ReturnSaleLinesModal` in `SalesModal` (`sales.sales_return` write) |
| P1 | Stabilize other date-based seeds (`seed-demo-sales.sql`, CRM, finance) | **Done** — stable refs: `DEMOSO101`, `DEMOSI201`, `DEMOFIN301`, `DEMOQUO*`, `DEMOPR*` |
| P2 | E2E Playwright flow for GR create/post | **Done** — `web/e2e/goods-receipt-receive.spec.ts` + CI `e2e-demo-smoke.yml` |
| P2 | `ts-prune` / dead-code sweep; doc content dedup (`moduleKbArticles` vs `documentationSections`) | **Done** — `npm run dead-code`; selling routes wired; `sectionKbCrossRefs` + `dead-code-sweep.md` |
| P2 | PDF golden tests drift (`document_golden_test.go`, `quotation_golden_test.go`) | **Mitigated** — smoke checks always; sha256 only when `PDF_GOLDEN_STRICT=1` |
| P3 | Full ECount tab-pill audit rows in `gaps-bluearm.md` | **Partial** — shell header rows in `tab-pills.csv`; `gaps-bluearm.md` nav section |

## Performance baseline

Record after each release on DEMO000:

| Metric | Target (local warm) | Command |
|--------|---------------------|---------|
| List p95 | < 400 ms | `bench-api.mjs` + `routes.core.json` |
| CI list p95 | < 800 ms | `api-perf-smoke.yml` |
| Web build | no regression | `npm run build` — inspect largest chunks (quotation/RFQ, pdfjs) |

ADR **0004** patterns (auth cache, async audit, gzip) remain the backend perf foundation; extended route lists catch regressions on hot paths only.

## Layered audit methodology

Use layers 1–10 from the gap/perf plan in chat (surface inventory → golden flows → seeds → automation → reconciliation → permissions → tab-pill parity → error grep → doc drift → bundle/query bench). Tick items in the manual checklist above per release.
