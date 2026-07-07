# ECount ERP audit (reference for BluearmERP)

Systematic capture of ECount modules, screens, controls, and business rules for parity planning.

**Critical:** Tab pills at every nesting level must be audited — see [`tab-pill-protocol.md`](tab-pill-protocol.md).

## How to run the audit

### Phase 0 — Tab pill registry (parallel with everything)

1. On every screen open, scan for pill-shaped links/tabs at L0–L4 (see protocol).
2. Add one row per pill to `tab-pills.csv` before marking the screen complete.
3. Click **every** pill; snapshot after each click; log fields that only appear on that pill.

### Phase 1 — Menu catalog (breadth)

1. Open **Site Map** in ECount — bulk extract `prgId` links to [`site-map-prgids.csv`](site-map-prgids.csv) (670 programs, Jul 2026).
2. For each leaf, record `prgId` from the URL hash (`prgId=C000029`).
3. Add one row to `coverage-matrix.csv` with status `cataloged` (bulk: `python scripts/merge-sitemap-catalog.py`).

### Phase 2 — Screen depth (per `prgId`)

For each screen, complete the checklist in `templates/screen-checklist.md`:

- Shell: breadcrumbs, left menu, top tabs
- **Tab pills (mandatory):** L0 module bar, Option/filter pills, form/modal pills, list status pills
- Toolbar buttons (click each)
- List: columns, sort, filter panel, pagination
- Row actions, context menu, inline edit
- Modals / slide-overs opened from the screen
- Save / validation / posting side effects

Mark row status `depth-complete` only when **all tab pills** for that `prgId` have `audited=yes` in `tab-pills.csv` AND toolbar coverage ≥95%.

### Phase 3 — Flow traces

Document end-to-end chains in `flows/`:

- Item → PO → GR → purchase invoice → payment
- Item → quotation → SO → delivery → sales invoice → OR
- Item → stock in/out → valuation → GL

### Phase 4 — Bluearm gap mapping

Update `gaps-bluearm.md` with P0–P3 priorities and target routes in Bluearm.

## File layout

| Path | Purpose |
|------|---------|
| `tab-pills.csv` | **Every tab pill** at all levels (mandatory) |
| `coverage-matrix.csv` | Master inventory of all programs |
| `screens/` | One markdown file per audited `prgId` |
| `flows/` | Cross-module business flows |
| `gaps-bluearm.md` | Parity backlog |

## Session notes

- Base URL pattern: `https://loginia.ecount.com/ec5/view/erp#...&prgId=XXXXX`
- Menu tree type: `menuType=MENUTREE_000004` (Inv. I)
- **Site Map export (Jul 2026):** 808 unique names in `site-map-inventory.txt`; parser at `scripts/parse-sitemap-snapshot.py`
- **Session:** ECount login required for live crawl — tab expires; re-attach browser after login at `loginia.ecount.com`
- **Inv. II Serial/Lot pass 18 (Jul 2026):** Subtree depth-complete — C000690 New F2 form, C000691/E040634 adj workspace, E040620/E040619/E041018 reports; pass 17 blanks were timing — see `screens/inv2-serial-lot.md`
- **Inv. II / Acct. I breadth:** Costing C000140, Acct Reports C000001; QC + Fast Entry menu catalogs from Site Map
- **F2 / New toolbar quirk:** on list screens, F2 opens list **settings** (Template, List Tab Settings, etc.), not inline new doc. Use left-menu **New …** for form programs (`E040205` Sales, `E040303` Purchases).
- Use browser snapshot after every navigation; large snapshots are saved under Cursor browser logs.
