# Deep dive — Inventory, Serial/Lot, Movements & Adjustments

**Audience:** product owner, ops, warehouse, superadmin  
**Evidence:** Observed — `docs/modules/inventory/`, serial-lot README, stock APIs/UI  
**Companion Notion:** Deep dive page under product knowledge home

---

## 1. What Stock is for (plain language)

Stock answers: **who** you trade with, **where** goods live, **what** you sell/buy, and **how quantity moves**.

Commercial documents (GR, SO release, Sales, POS) usually move stock **automatically**. Warehouse also has **manual** tools: Stock Entry, Stock Adjustment, Serial Register.

---

## 2. Screen map

| Group | Screens | Path |
|-------|---------|------|
| Masters | Partners, Locations, Units, Projects, Departments, Items, Categories | `/app/inventory/...` |
| Quantity | Stock Movements (ledger), Stock Adjustments, Stock Entries, Reconciliation, Inv Per Branch | `/app/inventory/stock-*` |
| Serial & Lot | Registry, Lots, Movements, Trace, Receive/Scan, Settings | `/app/inventory/serial-lot/...` (feature `inventory.serial_lot`) |
| Reports | Balance, On Hand, Status, Ledger, Inv Book, Ageing | `/app/inventory/reports/...` |
| Pricing / kits | Price lists, Product bundles | feature-gated |
| Make | BOMs, Work Orders | manufacturing features |
| WMS | Scheduled receipts | `inventory.wms` |

Form-field settings (cog): many masters use `GET/PATCH form-field-settings?entity_type=...` — tenants can hide/require standard fields.

---

## 3. Item master — fields & tracking logic

**Screen:** `/app/inventory/items` · Modal `ItemMasterModal` · Entity `inv_item`

### Key fields

| Area | Fields | Required? |
|------|--------|-----------|
| Identity | Item code (system), **Item name**, Status | Name + Status yes |
| Classification | Category, Item type, Production process, POS category | Optional |
| Units | Base unit, Unit label | Optional |
| Qty | Reorder level, **Track inventory quantity**, Unit identity | See below |
| Tracking | **Track serial** XOR **Track lot** XOR neither; Serial/Lot capture policy (`optional` / `required`) | Mutually exclusive |
| Price | Purchase / Sales / VIP / levels | Optional |
| Warranty | Warranty months | Optional |

### Tracking conditions (Hard)

| Rule | Effect |
|------|--------|
| Serial XOR Lot | Cannot track both on one item |
| Disable track flags | **Blocked** if open serial units or lot batches exist |
| Capture policy `required` | GR / sales / release must capture serials or lots |
| Capture policy `optional` | Capture allowed but not forced |
| `track_inventory_qty` | Balances and qty reports apply |

CSV import columns include: `item_name` (required), prices, `status`, `track_serial`, `track_lot`, `track_inventory_qty`, `warranty_duration_months`.

---

## 4. How quantity moves (sources of stock movements)

**Stock Movements** (`/app/inventory/stock-movements`) is a **ledger** (read list), not a create form.

| Source | User or system? | When movement is written |
|--------|-----------------|--------------------------|
| Goods Receipt **post** / reverse | System | Warehouse receive |
| SO Release / undo | System | Pick (combined: on-hand; split: reserve) |
| Delivery note **post** | System | Split mode stock out |
| Sales invoice (direct) | System | On-hand down |
| POS checkout | System | On-hand down |
| Manufacturing WO complete | System | Backflush + FG |
| **Stock Entry** post | User | Receipt / Issue / Transfer |
| **Stock Adjustment** approve | User | Qty delta |
| Serial **register** (if qty tracked) | User | Optional balance + movement |

List shows: item, location, `qty_delta`, `movement_type`, `ref_type`/`ref_id`, reason, created_at.

---

## 5. Stock Entry — form, types, gates

**Screen:** `/app/inventory/stock-entries` · Post permission `inventory.stock_entries_post`

### Header fields

| Field | Required | Notes |
|-------|----------|-------|
| entry_date | Optional → today | |
| entry_type | Yes | `transfer` \| `issue` \| `receipt` |
| from_location_id | By type | Required for transfer & issue |
| to_location_id | By type | Required for transfer & receipt |
| notes / reason | Optional | Issue may use presets (internal_use, product_defect) |

### Lines

≥1 line; each `item_id` + `qty` > 0.

### Location rules

| Type | From | To |
|------|------|-----|
| transfer | Required | Required |
| issue | Required | — |
| receipt | — | Required |

### Lifecycle

`draft` → **Post** → `posted`  
Only draft editable/deletable/postable. Insufficient stock blocks issue/transfer out.

### Movements on post

- receipt → `receipt`
- issue → `issue`
- transfer → `transfer_out` + `transfer_in`

---

## 6. Stock Adjustment — form, approval, gates

**Screens:** modal from movements · list of adjustments

### Header

| Field | Required |
|-------|----------|
| Reason | **Yes** |
| Attachments | Optional (after draft exists) |

### Lines (1–100)

Each: `item_id`, `location_id`, `qty_delta` (≠ 0) — all required.

### Lifecycle (real approval)

```
draft → Submit → e_approval → Approve → completed (posts stock)
                      ↘ Reject (+ remarks) → rejected / back
```

| Gate | Rule |
|------|------|
| Inventory change | **Only on Approve** — not on save/submit |
| Approve permission | `inventory.stock_adjustment_approve` |
| Approve / Reject | Remarks required |
| Negative stock | Blocked if would go below zero |
| Edit | Own drafts only (observed) |

Movement type after approve: `adjustment` / `stock_adjustment`.

---

## 7. Serial & Lot — lifecycle & forms

**Feature:** enable `inventory.serial_lot` under Module & Features.

### Chain

```
PR → PO → GR (scan) → Serial Registry (in_stock)
       → SO Release (reserved in split) → Sales (sold) → CRM Warranty
```

### Serial unit statuses (Observed)

| Status | Meaning |
|--------|---------|
| `in_stock` | Available |
| `reserved` | Held for SO (split/release) |
| `sold` | Issued on sale |
| `in_transit` | Transfer in progress |
| `void` / `scrapped` / `rma` | Excluded / special |

### Receive / Scan (on GR draft)

- Scan serials (batch max 100); lot entry for `track_lot`
- Pre-post: expected vs received vs serial count
- **Post blocked** until serial lines complete when required
- Undo last serial; reverse posted GR blocked if serials already sold

### Manual Serial Register form

| Field | Required |
|-------|----------|
| Date | Yes |
| Slip type | Yes |
| Location | Yes |
| Item (must track_serial) | Yes |
| Qty | Yes — **must be 1** |
| Serial no. | Yes — unique (non-void) |
| Remark / Project | Optional |

If item tracks inventory qty → also writes balance + stock movement.

### Lot

- GR lot entry; sales can carry `lot_batch_id` and decrement batch qty
- Same mutual exclusion with serial on item

### Hybrid release (ties to Process Policies)

| `legacy_combined_so_release` | Release | DR | Invoice qty check |
|------------------------------|---------|-----|-------------------|
| true (default) | On-hand − | Mostly paperwork | released − invoiced |
| false | Reserved +; serial reserved | Posts stock out | delivered − invoiced |

### Reconciliation (ops truth)

serial-qty mismatch · reserved-stale · SO release gap · reserve-without-DR · DR-without-invoice · GR-without-SI · GR serial gap

---

## 8. Work Orders (brief)

Statuses: `draft` → `released` → `completed`; cancel **only from draft**. Complete backflushes materials + FG receive.

---

## 9. Gates checklist (inventory)

| Gate | Hard / Soft |
|------|-------------|
| Foundation: location + partner + item | Hard (blocks transactional creates) |
| Serial XOR lot on item | Hard |
| Cannot disable tracking with open units | Hard |
| GR post needs complete serial/lot when required | Hard |
| Stock Entry insufficient stock | Hard |
| Adjustment posts only after Approve | Hard |
| Feature codes hide Serials/WMS/BOM/WO | Nav hard |
| Adjustment approval | Real workflow (not advisory) |

---

## 10. Compare to your warehouse

| Your question | Where in Bluearm |
|---------------|------------------|
| How do we receive with serials? | GR draft → Receive/Scan → Post |
| How do we fix wrong qty? | Stock Adjustment (approve) |
| How do we move between warehouses? | Stock Entry type = transfer |
| Who changed a serial? | Registry **History** vs **Trace** (ops path) |
| Why doesn’t dashboard match? | Reconciliation + red flags |
