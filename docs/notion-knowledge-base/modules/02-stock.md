# Module — Stock (Inventory)

**Sidebar label:** Stock  
**Module id:** `inventory`  
**Base:** `/app/inventory`

> **Deep dive:** `15-DEEP-INVENTORY-SERIAL-MOVEMENTS.md` (serial/lot, movements, adjustments, hybrid release)

## Owner view

Stock is the foundation: who you trade with, where goods live, what you sell, and how quantity moves. Serials, warehouse scheduling, and manufacturing hang off this area.

## Feature map

See `02-MASTER-INVENTORY.md` §3 for every path. Groups:

| Group | Features |
|-------|----------|
| Masters | Partners, Locations, Units, Projects, Departments, Items, Item categories |
| Quantity | Stock Movements, Adjustments, Entries, Reconciliation, Inv Per Branch |
| Serials | Serials registry (`inventory.serial_lot`) |
| Reports | Balance, On Hand, Status, Ledger, Inv Book, Ageing |
| Pricing / kits | Price List (`inventory.price_lists`), Product Bundles |
| Make | BOMs (`manufacturing.boms`), Work Orders (`manufacturing.work_orders`) |
| Sub-branches | Batch & serial tracking; Warehouse / WMS (`inventory.wms`) |

Partners also has settings; many masters use form-field settings (cog beside New row).

## Happy paths

### A. First masters

1. Partners → customers and suppliers.  
2. Locations → Main / branches.  
3. Items → products; turn on quantity tracking; optionally Track serial or Track lot (not both).  
4. Confirm stock reports show on-hand after receives.

### B. Serial chain (with buying/selling)

1. Enable `inventory.serial_lot`.  
2. Receive on Goods Receipt with serial scan (draft → post).  
3. Serial registry shows `in_stock`.  
4. On SO release (split mode) → `reserved`; on sales → `sold`.  

**Proven:** golden **S2**.

### C. Warehouse schedule

1. Enable `inventory.wms`.  
2. Open Warehouse → Scheduled Receipts.  
3. Schedule vs PO lines → compare to posted GR → variance / close.  

Pick waves / putaway: roadmap depth — **not** claimed complete (gap P3).

### D. Make finished goods (G-24 closed)

1. Define BOM (single-level).  
2. Create Work Order — statuses (migration `080`): `draft` \| `released` \| `completed` \| `cancelled`.  
3. Edit / cancel **only while `draft`** (`PATCH` may set `cancelled`).  
4. Release: `draft` → `released`.  
5. Complete: `released` → `completed` (backflush + FG receive).  

There is **no** cancel-from-released path in `work_orders.go`.

## Statuses (Observed)

| Area | Values |
|------|--------|
| Item (import) | active / inactive |
| Serial unit | `in_stock`, `reserved`, `sold`, `void` (excluded from resolve) |
| Work Order | `draft` → `released` → `completed`; cancel only from `draft` |

Stock movements are ledger events from commercial posts / adjustments.

## Gates

- Foundation needs at least one location, partner, item.  
- Serial/lot mutually exclusive on item; cannot disable flags with open units/lots.  
- Feature codes hide Serials / WMS / Price List / BOM / WO until enabled.  
- Adjustment approvals may be policy-gated.

## Handoffs

- All commercial docs read partners/items/locations/balances.  
- GR / Release / DR / SI / POS change quantity.  
- After-sales repair uses RMA locations (separate module).  
- Job costing projects ≠ Inventory → Projects.

## Builder view

- UI: `web/src/modules/inventory/`  
- Docs: `docs/modules/inventory/README.md`, `serial-lot/README.md`  
- Manufacturing: `api/internal/modules/manufacturing/`  
- WMS: `api/internal/modules/wms/`

## Evidence tags

Doc-backed + Observed for serial chain and WO statuses including cancel-from-draft. WMS pick-wave depth = UNKNOWN/roadmap.
