# Inventory windows — masters, qty, serial, manufacturing

Deep narrative: `../15-DEEP-INVENTORY-SERIAL-MOVEMENTS.md`  
Cog masters: `01-FORMFIELDS-REGISTRY.md`

---

## Masters (Form Settings)

| Screen | Path | Entity | Required defaults |
|--------|------|--------|-------------------|
| Partners | `/app/inventory/partners` | `inv_partner` | kind*, company*, status* |
| Locations | `/app/inventory/locations` | `inv_location` | name*, type*, production_process*, status* |
| Projects | `/app/inventory/projects` | `inv_project` | name*, status* |
| Departments | `/app/inventory/departments` | `inv_department` | name*, status* |
| Items | `/app/inventory/items` | `inv_item` | name*, status* (+ prices/tracking optional in registry) |

**Items Qty tab (not all in registry):** track inventory qty · track serial XOR lot · capture optional|required. Cannot disable tracking with open units/lots.

| Screen | Path | Form Settings? | Notes |
|--------|------|----------------|-------|
| Units | `/app/inventory/units` | No | Spreadsheet master |
| Item categories | `/app/inventory/item-categories` | No | |
| Price lists | `/app/inventory/price-lists` | No | Feature `inventory.price_lists` — fields UNKNOWN |
| Product bundles | `/app/inventory/product-bundles` | No | UNKNOWN |

**Foundation gate:** ≥1 location, partner, item before transactional POSTs (setup wizard).

---

## Stock Movements — `/app/inventory/stock-movements`

| | |
|--|--|
| **Kind** | ledger (read-only list) |
| **Columns** | item, location, qty_delta, movement_type, ref, reason, created |
| **Creates?** | No — written by GR, Release, DR, Sales, POS, Entry, Adjustment, WO, etc. |

---

## Stock Entry — `/app/inventory/stock-entries`

| | |
|--|--|
| **Kind** | transaction · Form Settings **No** |
| **Header** | entry_type* (`receipt`\|`issue`\|`transfer`), date, from/to location by type, notes |
| **Lines** | item_id*, qty* (>0) |
| **Statuses** | draft → posted |
| **Gates** | Location rules by type · insufficient stock blocks issue/transfer |
| **Stock** | On **post** |

---

## Stock Adjustment — `/app/inventory/stock-adjustments`

| | |
|--|--|
| **Kind** | transaction · draft `inv_stock_adjustment` · Form Settings **No** |
| **Header** | reason* |
| **Lines** | item*, location*, qty_delta* (≠0), 1–100 lines · attachments optional |
| **Statuses** | draft → Submit → e_approval → Approve → completed \| rejected |
| **Gates** | Stock changes **only on Approve** · remarks on approve · no negative stock · permission `inventory.stock_adjustment_approve` |

---

## Stock Reconciliation — `/app/inventory/stock-reconciliation`

| | |
|--|--|
| **Kind** | transaction |
| **Fields / statuses** | UNKNOWN — backlog |

---

## Serial & Lot

> Full window catalog: **`09-SERIAL-LOT-WINDOWS.md`** (registry, receive/scan, manual register, lots, reports).

| Screen / action | Path / context | Key fields | Logic |
|-----------------|----------------|------------|-------|
| Registry | `/app/inventory/serial-lot/registry` | status filter | in_stock/reserved/sold/in_transit/void/scrapped/rma · History vs Trace |
| Receive/Scan | on **GR draft** + `/serial-lot/receive` | serial batch ≤100 / lot | Post blocked until complete when capture required |
| Manual register | modal | date*, slip*, location*, item*, qty=1*, serial* | Unique non-void serial; may post qty movement |
| Lots | `/app/inventory/serial-lot/lots` | lot batches | Qty decrement on sales `lot_batch_id` |

Feature: `inventory.serial_lot`

---

## Manufacturing

| Screen | Path | Draft key | Statuses / gates |
|--------|------|-----------|------------------|
| BOMs | `.../manufacturing/boms` | `mfg_bom` | Feature `manufacturing.boms` — form fields UNKNOWN depth |
| Work Orders | `.../manufacturing/work-orders` | `mfg_work_order` | draft → released → completed · cancel only from draft · complete backflush + FG |

---

## WMS

| Screen | Path | Notes |
|--------|------|-------|
| Scheduled receipts | `/app/inventory/wms/scheduled-receipts` | Feature `inventory.wms` — form depth UNKNOWN |

---

## Reports / find stock

| Screen | Path | Kind |
|--------|------|------|
| Inv Per Branch | `/app/inventory/find-stock` | report |
| Stock Balance / On Hand / Status / Ledger / Inv Book / Ageing | `/app/inventory/reports/*` | report |

Filters only — no document form.
