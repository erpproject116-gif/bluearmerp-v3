# C000092 — Serial/Lot No. Slip List

**Menu path:** Inv. II → Serial/Lot No. → **Serial/Lot No. Slip List**  
**URL:** `menuType=MENUTREE_000783`, `menuSeq=MENUTREE_000208`, `groupSeq=MENUTREE_000208`, `prgId=C000092`  
**Bluearm target:** `/app/inventory/serial-lot` (serial receive/history)  
**Audit status:** depth-complete pass 17 (Jul 7 2026)

See subtree hub: `screens/inv2-serial-lot.md`.

## Inv. II module context

Inv. II L0 tabs: After-Sales Service · **Serial/Lot No.** · Quality Control · Plan Mgmt · Costing · Order Mgmt · Export · WMS

Default on first Inv. II open: **Costing** (`C000140`). Serial/Lot tab loads this list.

## Left menu (Serial/Lot No. subtree)

| Link | prgId | Notes |
|------|-------|-------|
| Reg. Serial/Lot No. | C000690 | Shared list shell; **New (F2)** opens registration form (pass 18) |
| Serial/Lot No. Slip List | **C000092** | **This screen** |
| Serial/Lot No. Status | E040639 | Status report |
| Inventory Adj. by Serial/Lot No. | C000691 / E040634 | Duplicate left-menu labels |
| Serial/Lot No. Inv. Book | E040620 | Ledger-style book |
| Serial/Lot No. Inv. Balance | E040619 | Balance by serial |
| Item vs. Serial/Lot No. Balance | E041018 | Reconciliation |

## L2 status / type pills

| Pill | Notes |
|------|-------|
| **All** | Default; all slip types |
| **1** … **10** | Per-type filters (tenant slip-type codes; pill **1** verified clickable Jul 2026) |

Tenant has live rows (Jul 2026). Row links use date + suffix pattern (e.g. `07/07/2026 -71`, `07/07/2026 -5`).

## Option panel (Default pill)

| Section | Controls |
|---------|----------|
| Date | Simple Search **Recent 30 Days (+1 Month)** — sample range 06/2026 ~ 08/2026 |
| Terms of Validity | Do Not Use (optional range same window) |
| Item | Select + category tree (Raw Material … Intangible Merchandise), Include Sub-groups |
| Origin | **All** · **Linked Slip** · **Set Manually** |
| Sort | Sort by Modified Date |
| Template | Applied Template Default (Not Editable) |

## Toolbar

Quick search (`Input and press [Enter]`), Search (F3), Option, Help, **New (F2)**, Delete Selected, Excel

## Grid (live tenant)

- Row checkbox + clickable date/line links
- No e-Approval / Change Status toolbar (unlike Inv. I sales/purchase lists)

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| 10 slip-type filter pills | Serial history by doc type not exposed |
| Linked Slip vs Set Manually | Filter manual vs document-linked serial rows |
| Serial/Lot Inv. Book / Balance | Partial — serial units + scan APIs exist |
| Inventory Adj. by Serial/Lot | Stock entries by serial TBD |
