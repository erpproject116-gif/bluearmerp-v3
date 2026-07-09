# Bluearm ERP v3 — Product roadmap (Phases 0–4)

Operating plan to reach **Ecount-class trading ERP** reliability, then depth in inventory, reports, and selected Tier C modules.

**North star:** Quote → SO → deliver → invoice → collect and PO → GR → purchase → pay, with trustworthy GL and hosted ops.

**Tracking:** Each gap row in [`docs/ecount-audit/gaps-bluearm.md`](ecount-audit/gaps-bluearm.md) becomes a ticket tagged `phase-N`.

---

## Phase 0 — Production trust (weeks 1–6) **← current**

**Goal:** No silent schema failure; golden paths verified in CI; deploy is repeatable.

| # | Deliverable | Status |
|---|-------------|--------|
| 0.1 | `internal/platform/migrate` package shared by CLI + Docker | Done |
| 0.2 | `MIGRATE_ON_START=true` + Docker entrypoint applies migrations on deploy | Done |
| 0.3 | `GET /health/schema` — pending migrations + critical tables | Done |
| 0.4 | Render health check → `/health/schema` | Done |
| 0.5 | `scripts/golden-path-smoke.mjs` + CI workflow `api-golden-smoke.yml` | Done |
| 0.6 | Deploy checklist runbook | Done — [`runbooks/deploy-checklist.md`](runbooks/deploy-checklist.md) |
| 0.7 | Rate-limit / query invalidation regression tests | Done (prior work) |
| 0.8 | Production: apply migration **142** on Render DB | **Operator** — redeploy API with `MIGRATE_ON_START` |

**Exit gate:** Demo tenant + pilot complete golden path 2 weeks with zero manual SQL fixes.

```bash
curl https://YOUR-API.onrender.com/health/schema   # healthy: true
node scripts/golden-path-smoke.mjs                 # local, with BENCH_TOKEN
```

---

## Phase 1 — Core commercial GA (months 2–5)

**Goal:** Daily selling/buying/finance matches Ecount **operations** (not full report tree).

### Selling
- [ ] Harden invoice tab = print parity (line breakdown, approval on tab) — largely done
- [ ] Automated tests: SO → sale residual qty, slip lines, fulfillment status
- [ ] Cash In + accounting voucher docs in KB
- [ ] Sales Hold / reservation (Ecount gap) — if pilot needs it
- [ ] Shipping order from line — if distribution pilot

### Buying
- [ ] Purchase attachments end-to-end on prod (migration 142)
- [ ] GR / PO / RFQ load slip regression tests
- [ ] Cash Payment on purchase (Ecount footer) — optional

### Finance (Acct I minimum)
- [ ] Bank reconciliation: match modal usable weekly
- [ ] JE draft → post workflow documented; auto-post policies in setup wizard
- [ ] Month-close checklist (pilot runbook)
- [ ] Block account changes when JE posted — done

### Engineering
- [ ] Expand `routes.golden.json` with POST smoke (create draft quotation) behind feature flag
- [ ] Playwright: open sale → Invoice tab shows lines
- [ ] Every Phase 1 feature: migration + API + UI + KB + demo seed row

**Exit gate:** Pilot runs month-close on Bluearm; finance README checklist 80% automated.

**Primary gap source:** `gaps-bluearm.md` → P1 Selling, P1 Buying.

---

## Phase 2 — Inventory & item master (months 5–11)

**Goal:** Serial/lot and item depth for distribution/retail pilots.

| Track | Ecount reference | Deliverable |
|-------|------------------|-------------|
| Item modal | P1 Item master | Extend tabs toward 7-pill coverage |
| Price levels | VIP + B–J | Price list on item |
| Serial/lot | P1 Serial/Lot | Serial book, balance, adj-by-serial UI |
| Stock ledger | P1 Inv Balance | Opening/issue/closing; location matrix |
| Safety stock | Tab pill parity | Alerts on below-safety |

**Exit gate:** Serial sale + GR trace visible in UI and one stock ledger report without spreadsheets.

---

## Phase 3 — Reports & analytics (months 8–18, parallel)

**Goal:** Cover 80% of pilot questions without cloning every Ecount Option panel.

### 80/20 report pack (ship first)
1. Sales status (by line)
2. Purchase status (by line)
3. AR/AP aging as-of (extend receivable/payable status)
4. Inventory balance + stock ledger
5. Customer/Vendor book (AR/AP — done)
6. Pre-invoicing (done)
7. Sales/Purchase order status
8. Outstanding quote/SO/PO backlog

### Process
- One report = one API + list page + CSV + catalog entry
- Saved views (BI module) as escape hatch for odd filters
- **Defer:** Message Log, Proof Center, Management Report templates, All-In-One cockpit

**Exit gate:** 15 reports GA; pilot stops exporting to Excel for core ops.

**Primary gap source:** `gaps-bluearm.md` → P1 Sales/Purchase/Others reports.

---

## Phase 4 — Tier C selective GA (months 12–24)

Promote only modules tied to paying pilots. See [`TIER_C_BACKLOG.md`](TIER_C_BACKLOG.md).

| Module | Promote when | Keep beta otherwise |
|--------|--------------|---------------------|
| POS | Retail pilot + printer path | Offline/card gateway |
| Manufacturing | Make-to-order customer | Multi-level BOM |
| HR/Payroll | PH compliance owner signed off | Statutory tables |
| Portal | Customer read-only in production | Payments/upload |
| Support/QMS | Tickets + CAPA in daily use | Full SLA engine |

**Exit gate:** 3 Tier C modules marked **GA** with runbook + tests.

---

## Definition of Done (all phases)

1. Migration (if schema change)
2. API + permission
3. Web UI
4. KB article or `documentationSections.ts`
5. Golden smoke or integration test
6. Demo seed row (if user-visible)

---

## How to work each week

1. Pick **one phase** focus (don't mix Phase 0 ops with Phase 3 reports in the same sprint).
2. Close **5 P1** or **10 P2** rows from `gaps-bluearm.md`.
3. Run `go test ./...`, `npm run build`, `node scripts/golden-path-smoke.mjs` before merge.
4. Deploy API → verify `/health/schema` → deploy web.

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [`ecount-audit/gaps-bluearm.md`](ecount-audit/gaps-bluearm.md) | Ecount parity backlog |
| [`TIER_C_BACKLOG.md`](TIER_C_BACKLOG.md) | Extended modules |
| [`runbooks/deploy-checklist.md`](runbooks/deploy-checklist.md) | Every production deploy |
| [`runbooks/render-deploy.md`](runbooks/render-deploy.md) | Render + Supabase pooler |
