# Tab pill audit protocol

ECount (and Bluearm) hide substantial functionality behind **tab pills** inside windows, modals, filter panels, and inline forms. Missing a tab means missing fields, validations, posting rules, and reports.

**Rule:** Every window audit is incomplete until **every tab pill at every nesting level** is opened and logged.

## Tab pill levels (check all)

| Level | Where | Examples |
|-------|--------|----------|
| L0 | Top module bar | Inv. I: Setup · Sales · Purchases · Production · Inv. Mov. · Reports |
| L1 | Left setup sub-menu | Customer/Vendor, Item, Price Mgmt (expandable) |
| L2 | Screen header tabs | Default · Item Information · Qty · Price · Cost · … |
| L3 | Modal / slide-over tabs | Same pattern inside popups opened from toolbar |
| L4 | Nested modal tabs | Pickers, relation settings, Excel wizard steps |
| L5 | Option / column designer tabs | Filter builder sections (often pill-shaped links) |

## Per-tab capture checklist

For **each** tab pill, record in `tab-pills.csv`:

1. **tab_id** — stable slug (`form-qty`, `filter-price`, `module-purchases`)
2. **parent_context** — window/modal name + `prgId`
3. **tab_label** — visible pill text
4. **default_active** — yes/no on first open
5. **fields** — inputs, radios, checkboxes, grids (bullet list)
6. **sub_tabs** — child pills inside this tab (L+1)
7. **toolbar_in_tab** — buttons only visible on this tab
8. **grid_columns** — if tab contains a list
9. **validations** — required markers, disabled states
10. **posting_effect** — stock / GL / none
11. **bluearm_target** — route + component
12. **audited** — yes/no

## Crawl algorithm (do not skip)

```
for each screen (prgId):
  snapshot shell
  for each L0 module tab:
    click tab → wait → snapshot
    for each L1 menu item under tab:
      open screen → snapshot
      for each L2 screen tab pill:
        click pill → snapshot → log fields
        for each toolbar button visible on this tab:
          open modal → repeat tab crawl inside modal (L3/L4)
      if Option / Settings / Relation buttons:
        open → crawl all filter/column pills
  mark screen depth-complete only when tab-pills.csv has audited=yes for all rows
```

## Coverage metric

```
tab_coverage = audited_tabs / discovered_tabs
screen_complete = tab_coverage >= 1.0 AND toolbar_coverage >= 0.95
module_complete = all screens in module are screen_complete
```

## Common misses (watch list)

- **Option** panel section pills (Default, Qty, Price, …) — not the same as form tabs
- **Inactive** tabs that only appear after selecting a row or item type
- **Tax Included** rows on Price tab only
- **Excel** wizard multi-step tabs
- **Reports** with sub-tabs (Summary / Detail / Chart)
- Module bar tabs (Sales vs Purchases) — entirely different program trees
- **Settings** gear on list vs form — separate tab sets

## Files

| File | Purpose |
|------|---------|
| `tab-pills.csv` | Master registry of every tab pill |
| `screens/{prgId}.md` | Summary + link to tab rows |
| `coverage-matrix.csv` | Add columns `tab_count`, `tabs_audited` |

## Hash navigation quirks (live crawl)

| Pattern | Detail |
|---------|--------|
| `menuSeq` vs site map | Some tenant leaves use a different `menuSeq` than `site-map-prgids.csv` (e.g. Inventory Balance `E040701` → **`MENUTREE_001888`**, not `MENUTREE_000212`) |
| `menuType` module | N-prefix invoice status **non-Inv.** reports (`N000118`, `N000126`) require **`menuType=MENUTREE_000001`** (Acct. I); Inv. I hash opens wrong screen |
| N-prefix summaries | **Sales Summary** `N000121` and **Purchase Summary** `N000128` under Management Resource also require **`menuType=MENUTREE_000001`** |
| Fund In./De. Details | `E010815` can show blank workspace or stale **Fund Statement** title after long sessions — reload base URL |
| Management Report prgId | Acct. I **Management Resource** → `E010821` (chart templates); Inv. I Others → `E040704` (date-only report) — same label, different programs |
| View Transaction History prgId | Acct. I Others → `E010712` (title **Change History (Acct.)**); Inv. I Others → `E040716` (title **Change History**) |
| E010847 live title | Site Map **Accounting Transaction Status** → live title **Voucher Status** |
| All-In-One I menuSeq | Under Acct. I Others use **`MENUTREE_001352`** (not site-map `MENUTREE_000663` for Inv. I) |
| Acct. I blank workspace | Click **Acct. I** module tab (or reload + wait ~8s) before deep-link hash navigation |
| Stuck workspace | Reload base ERP URL (no hash) if title/filters stop updating after many hash hops |
| Inv. II `menuType` | Serial/Lot (and all Inv. II subtrees) require **`menuType=MENUTREE_000783`**; using `MENUTREE_000208` alone opens **Costing** |
| Inv. II Serial/Lot blank iframe | Pass 17 “blocked” screens were **insufficient wait** — allow **8–10s** after navigation; reload base URL if still blank after rapid hops |
| Duplicate Inv Adj menu | Left menu shows **Inventory Adj. by Serial/Lot No.** twice → `C000691` (`MENUTREE_001892`) vs `E040634` (`MENUTREE_001338`); **same adjustment workspace UI** in BLUEARM tenant |

## Bluearm application

When implementing parity:

- Map each ECount tab pill to a **SolidJS tab panel** or **accordion section** in the matching Bluearm page/modal.
- Do not collapse multiple ECount tabs into one form unless fields are truly equivalent.
- Header `*HeaderNav` components are L0/L1; in-page `Tabs` are L2+.
