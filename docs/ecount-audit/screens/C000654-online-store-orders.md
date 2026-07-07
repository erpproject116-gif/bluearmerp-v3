# Inv. I — Online Store Mgmt (pass 3)

**Module:** Inv. I → **Online Store Mgmt** L0 tab  
**Hub prgId:** `C000654` · **Order Mgmt hub:** `C000665`  
**Audit status:** pass 3 — live crawl Jul 7 2026 (Option filters + Collect Orders / Change Status workflows)  
**Bluearm target:** — (future marketplace connector)

> **Not** the same as Inv. II → Order Mgmt (`C000651`) — that module tracks RMA/fulfillment process templates. Online Store Mgmt handles **e-commerce channel orders**.

## Left menu

| Section | Programs | Site Map prgId |
|---------|----------|----------------|
| Setup | Online Store Mgmt/Register Item Settings · Link to Online Store Item Code | `E041003` · `E041004` |
| **Order Mgmt** | Order Mgmt Status · Order Confirmation · Delivery · Cancel · Return · Exchange · ERP Transmission | see below |

Register Online Store hub: see `C000654-online-store.md`.

---

## Order Mgmt Status (`E041005`)

**L2 status pills** (with live counts): All · New Order · Order Confirmed · Ready to Release · Released · Cancellation Received · Cancellation Complete · Return Received · Return in Progress · Returned · Exchange Received

| Column | Notes |
|--------|-------|
| Online Store Type | |
| Order No. / Bundled Order No. | |
| Payment Date | |
| Online Store Item Name / Key | |
| Qty / Sales Order Amount | |
| Order Status | |
| Item Code (ERP) / Item Name (ERP) | |
| Process by Status Function | |
| Delivery Method Code / Delivery Method | |
| Payable No. | |

**Toolbar:** Search (F3), Option, Help, **Change Status**, Collect Orders, Delete Selected, Item Mapping, ERP Transmission (S/O), View Mapping, Transmission / Reception Status, Provided Features by Online Store, Excel

**Empty state:** `No data has been registered.`

### Option filter panel

**L2 pills:** Default · All

| Section | Fields |
|---------|--------|
| Sales Order Date | Simple Search · Recent 7 Days · date range |
| Payment Date | Range + **Use** checkbox |
| Collected Date | Range + **Use** checkbox |
| Online Store | Select |
| Order Status / Process Function | Select |
| Delivery Information Entry Status | All · Not entered · Enter |
| Item Mapping Status | All · Unmatched · Matching |
| Search fields | Last Process Date · Order No. · Bundled Order No. · Online Store Item Code/Name · Order Option · Customer · Recipient · Contact · Address · Payable No. · Add. Fields 1–5 · Item(ERP) · ERP Transmission Status (SO/Sale) · Online Store Type |

### Collect Orders workflow

Toolbar **Collect Orders** opens modal:

| Field | Notes |
|-------|-------|
| Date | Range (default ~ last few days) |
| Online store | Checkbox selector |
| Actions | **Collect Orders** (confirm) · **Close** · **View Details** link |

Pulls new orders from connected online store APIs for the selected date window.

### Change Status workflow

Toolbar **Change Status** requires **row selection** first (tenant list empty — no modal without selected rows). Bulk status transition for selected order lines.

---

## Order Confirmation (`E041006`)

**L2 status pills:** All

| Column | Notes |
|--------|-------|
| Online Store Type | |
| Order No. / Bundled Order No. | |
| Payment Date | |
| Online Store Item Name / Key | |
| Qty / Sales Order Amount | |
| Order Status | |
| Process by Status Function | |
| Item Code (ERP) / Item Name (ERP) | |
| Recipient / Recipient Contact 1 / 2 | |

**Toolbar:** Search (F3), Option, Help, **Collect Orders**, Delete Selected, Item Mapping, ERP Transmission (S/O), Transmission / Reception Status, Provided Features by Online Store, Excel, ECOUNT Web Uploader

**Empty state:** `No data has been registered.`

---

## Delivery (`E041007`)

**L2 status pills:** All

Same core columns as Order Confirmation **plus:**

| Column | Notes |
|--------|-------|
| Address | Ship-to address |
| Delivery Cost Amount | |
| Delivery Method Code / Delivery Method | |
| Payable No. | |
| Delivery Notes | |

**Toolbar:** Search (F3), Option, Help, **Ready to Release**, Delete Selected, Item Mapping, ERP Transmission (sales), View Mapping, Transmission / Reception Status, Provided Features by Online Store, Excel, ECOUNT Web Uploader

**Empty state:** `No data has been registered.`

---

## Cancel (`E041008`)

**L2 status pills:** All

| Column | Notes |
|--------|-------|
| Online Store Type | |
| Order No. / Bundled Order No. | |
| Payment Date | |
| Online Store Item Name / Key | |
| Qty / Sales Order Amount | |
| Order Status | |
| Process by Status Function | |
| Item Code (ERP) / Item Name (ERP) | |
| Recipient / Recipient Contact 1 / 2 | |
| Reason of Claim | |

**Toolbar:** Search (F3), Option, Help, **Cancellation Complete**, Delete Selected, Item Mapping, ERP Transmission (S/O), Transmission / Reception Status, Provided Features by Online Store, Excel

**Empty state:** `No data has been registered.`

---

## Return (`E041009`)

**L2 status pills:** All

Same columns as Cancel **plus** Address, Delivery Cost Amount, **Reason of Claim**

**Toolbar:** Search (F3), Option, Help, **Returned**, Delete Selected, Item Mapping, ERP Transmission (S/O), Transmission / Reception Status, Provided Features by Online Store, Excel

**Empty state:** `No data has been registered.`

---

## Exchange (`E041010`)

**L2 status pills:** All

Return columns **plus** Delivery Method Code/Method, Payable No., Delivery Notes

**Toolbar:** Search (F3), Option, Help, **Returned (Exchange)**, Delete Selected, Item Mapping, ERP Transmission (S/O), Transmission / Reception Status, Provided Features by Online Store, Excel

**Empty state:** `No data has been registered.`

---

## ERP Transmission (`E041011`)

**L2 status pills:** All

| Column | Notes |
|--------|-------|
| Online Store Type | |
| Order No. / Bundled Order No. | |
| Payment Date | |
| Online Store Item Name / Key | |
| Qty / Sales Order Amount | |
| Order Status | |
| Item Code (ERP) / Item Name (ERP) | |
| Recipient / Contact / Address | |
| ERP Transmission Status (Sales Order) | |
| ERP Transmission Status (Sale) | |

**Toolbar:** Search (F3), Option, Help, Delete Selected, Item Mapping, ERP Transmission (S/O), Excel, **ERP Item Mapping Settings**

**Empty state:** `No data has been registered.`

---

## Tab pill checklist

- [x] Order Mgmt Status — 11 status pills + columns
- [x] Order Confirmation — list columns + Collect Orders
- [x] Delivery — list columns + Ready to Release
- [x] Cancel — list columns + Cancellation Complete
- [x] Return — list columns + Returned
- [x] Exchange — list columns + Returned (Exchange)
- [x] ERP Transmission — dual ERP status columns + mapping settings
- [x] Order Confirmation Option filter panel — shared with Status (`E041005` Option)
- [x] Collect Orders workflow — date-range modal + View Details
- [x] Change Status workflow — requires row selection (documented)
