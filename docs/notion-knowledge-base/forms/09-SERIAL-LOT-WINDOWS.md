# Serial & Lot windows

**Feature:** `inventory.serial_lot` (Module & Features)  
**Deep narrative:** `../15-DEEP-INVENTORY-SERIAL-MOVEMENTS.md`  
**Form Settings:** No (not in `formfields` registry)

Item flags that drive these windows (Items Qty tab — not all in Form Settings):

| Flag | Rule |
|------|------|
| Track serial XOR Track lot XOR neither | Mutually exclusive HARD |
| Capture policy `optional` \| `required` | When `required`, GR/sales/release must capture |
| Cannot disable tracking | HARD if open serial units or lot batches exist |

---

## Screen map

| Screen | Path | Kind |
|--------|------|------|
| Registry | `/app/inventory/serial-lot/registry` | board |
| Receive / Scan | `/app/inventory/serial-lot/receive` (also from GR draft) | transaction |
| Manual register | modal on registry | transaction |
| Serial adjustment | `/app/inventory/serial-lot/adjustment` | transaction |
| Lot adjustment | `/app/inventory/serial-lot/lot-adjustment` | transaction |
| Lot batches | `/app/inventory/serial-lot/lots` | board |
| Serial movements | `/app/inventory/serial-lot/movements` | ledger |
| Trace | `/app/inventory/serial-lot/trace` | report |
| Status / Book / Balance / Reconciliation | `/app/inventory/serial-lot/reports/*` | report |
| Settings | `/app/inventory/serial-lot/settings` | config |
| BOMs / Work Orders | under `.../manufacturing/*` | see Inventory pack |

---

## Serial unit statuses (Observed)

| Status | Meaning |
|--------|---------|
| `in_stock` | Available |
| `reserved` | Held for SO (split/release mode) |
| `sold` | Issued on sale / POS |
| `in_transit` | Transfer in progress |
| `void` / `scrapped` / `rma` | Excluded / special |

**History** vs **Trace:** History = audit of the unit; Trace = ops path across docs.

---

## Receive / Scan — `/app/inventory/serial-lot/receive`

| | |
|--|--|
| **Kind** | transaction · usually tied to **GR draft** |
| **Per line** | expected_qty · received_qty · serials[] or lots[] when tracked |
| **Serial scan** | Batch max **100**; bulk parse + dedupe |
| **Lot entry** | lot_no · qty · optional expiry |
| **Gates** | Pre-post: expected vs received vs serial/lot count · **Post blocked** until complete when capture `required` |
| **Reverse** | Posted GR reverse blocked if serials already sold/reserved |

Happy path: PR → PO → **GR draft → Receive/Scan → Post** → Registry `in_stock`.

---

## Manual Serial Register (modal)

API: `POST /api/v1/inventory/serial-units/register`

| Field | Required | Notes |
|-------|----------|-------|
| register_date | Yes* | Defaults today |
| slip_type | Yes* | See slip types below (default `quotation`) |
| location_id | Yes | |
| item_id | Yes | Must track serial |
| qty | Yes | **Must be 1** |
| serial_no | Yes | Unique among non-void |
| remark | No | |
| project_id | No | |

\*UI requires item, location, serial; qty must be 1.

If item also tracks inventory qty → may write balance + stock movement.

### Slip types (Observed UI)

quotation · sales_order · sales · shipping_order · shipping · purchase_order · purchases · goods_receipt · consumed · repair_order · repair · location_tran · goods_issued · internal_use · defect_* · quality_* · invoice_packing_list

---

## Lot batches — `/app/inventory/serial-lot/lots`

| | |
|--|--|
| **Kind** | board / master of batches |
| **Create path** | Primarily GR lot entry when item `track_lot` |
| **Consume** | Sales / POS can carry `lot_batch_id` and decrement batch qty |
| **XOR** | Same item cannot also track serial |

Lot adjustment page: `/app/inventory/serial-lot/lot-adjustment` — field depth **partial** (use UI; deepen if needed).

---

## Serial / Lot adjustments

| Screen | Path | Notes |
|--------|------|-------|
| Serial adjustment | `.../adjustment` | Status / location fixes — deepen UNKNOWN for full field list |
| Lot adjustment | `.../lot-adjustment` | Batch qty / attributes — UNKNOWN depth |

Do **not** confuse with Stock Adjustment (`/app/inventory/stock-adjustments`) which changes **qty balances** via approve workflow.

---

## Lifecycle (ops)

```
GR scan → in_stock
  → SO Release (reserved in split mode)
  → Sales / POS (sold)
  → CRM Warranty (if warranty_months > 0)
```

Hybrid qty behavior: Process Policy `legacy_combined_so_release` (see Inventory deep dive §7).

---

## Gates checklist

| Gate | Hard / Soft |
|------|-------------|
| Feature `inventory.serial_lot` enabled | Nav hard |
| Serial XOR lot on item | Hard |
| Capture `required` → complete before GR/sales post | Hard |
| Serial register qty = 1 · unique serial | Hard |
| Reverse GR if serials sold | Hard |
| Stock Adjustment ≠ Serial adjustment | Conceptual |

---

## Related

| Topic | File |
|-------|------|
| Stock Entry / Adjustment / Movements | `05-INVENTORY-WINDOWS.md` |
| Buy GR | `04-BUY-WINDOWS.md` |
| Sell release / SI | `03-SELL-WINDOWS.md` |
| POS serials | `07-POS-CRM-SERVICE.md` |
| Warranty | `07` + `../19-DEEP-CRM.md` |
