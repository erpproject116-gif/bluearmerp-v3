# Safe Ecount full-surface crawl plan (no data mutation)

**Goal:** Emulate / inventory **every** Ecount page, tab, panel, button, nav, link, form, modal (incl. nested), settings, and search — using live tenant **BLUEARM COMPUTER STORE** — **without** changing production data.

**Do not** treat this as “product complete.” Completeness is gate-driven (`docs/ecount-audit/scorecard.md`).

---

## Hard safety rules (non-negotiable)

1. **Read-only crawl** — Prefer Site Map navigation + snapshots. Never click Save / Confirm / Post / Delete / Excel Import / Transfer / Cash In-Out that commits unless on an isolated **demo** company.
2. **Session** — Use existing logged-in tab `loginia.ecount.com`. If session expires, re-login; do not create duplicate companies.
3. **No form submit** — Opening New/F2 forms and nested modals is OK; closing with Cancel/X only. Fill fields only when needed to reveal conditional tabs; then discard.
4. **No print/email send** — Open print preview if needed, then close without sending.
5. **Evidence** — Every leaf writes/updates: `coverage-matrix.csv`, `tab-pills.csv`, optional `screens/{prgId}.md`.

---

## Universe (already cataloged)

| Source | Count |
|--------|------:|
| Site Map `prgId`s | 670 |
| Coverage rows (G0) | 671 (incl. 1 extra) |

Reconcile before each campaign:

```bash
cd docs/ecount-audit
python scripts/reconcile-sitemap-coverage.py --check
```

---

## Crawl algorithm (zero skip)

```
for each top module in [MyPage, User Customization, Inv.I, Inv.II, Acct.I, Acct.II, Mgmt, GW, Data Center]:
  open module via header
  for each L0 tab (Setup / Sales / …):
    snapshot; log L0 pill
    for each L1 left-menu leaf (prgId):
      open screen; snapshot
      for each L2 screen / Option / status pill:
        click; snapshot; log fields unique to pill
        for each toolbar button:
          open modal/slide-over if non-destructive
          crawl L3/L4 nested tabs; Cancel out
      if Settings / F2 list settings / Relation / Excel:
        open; crawl; Cancel
      mark tabs_audited; when 100% + toolbar ≥95% → depth-complete
```

Protocol: [`tab-pill-protocol.md`](tab-pill-protocol.md) + [`templates/screen-checklist.md`](templates/screen-checklist.md).

---

## Campaign order (minimize risk, max ops value)

1. **Inv. I Sales + Purchases** (ticket-heavy) — lists first, then New forms (Cancel only)
2. **Inv. I Setup Item / Partner / Location**
3. **Inv. I Inv. Mov. + Production/GR**
4. **Inv. II Serial/Lot** (verify vs Bluearm parity rows)
5. **Acct. I Fast Entry + Reports hubs**
6. **Acct. II AR/AP**
7. **Reports trees** (often read-only — safer)
8. **Mgmt / GW / Data Center** — mark `deferred` if unlicensed; still catalog Site Map leaves

---

## Browser procedure (Cursor IDE browser)

1. Lock tab Browser ID for BLUEARM COMPUTER STORE.
2. Prefer **Site Map** button → click `prgId` links from `site-map-prgids.csv` in batches of 10–20.
3. After each screen: update matrix row `status`, `tab_count`, `tabs_audited`, `notes`.
4. Unlock browser when session ends.

**Destructive control blacklist:** Save, Confirm, Delete, Post, Import, Upload (except opening empty dialog), Cash Payment, Generate voucher.

---

## Mapping to Bluearm

After depth-complete for a `prgId`:

- Set `bluearm_parity` = `parity` | `partial` | `missing` | `deferred`
- Link `bluearm_route`
- If gap: row in `gaps-bluearm.md` with priority

---

## Exit criteria

| Gate | Pass |
|------|------|
| G0 | Site Map − coverage = 0 (already) |
| G2 per module | All module rows `depth-complete` |
| G3 | No silent `missing` for P0/P1 in that module |
| Language | Never claim “nothing missed” without gate numbers |

---

## Relation to ticket work (this sprint)

| Ticket | Bluearm change |
|--------|----------------|
| Serial generator | Inv. II Registry → Generate serials / print labels |
| Repair = RMA | Repair Order + RMA location flag + serial status `rma` |
| Load Slip SO | Open SO lines default all partners |

These do **not** replace the crawl; they close Computer Store process gaps while the audit continues.
