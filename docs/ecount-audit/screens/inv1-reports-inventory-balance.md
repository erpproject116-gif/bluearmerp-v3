# Inv. I → Reports → Inventory Balance subtree (pass 11–12)

**Audit date:** Jul 7 2026 (pass 11–12)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Inv. I → Reports → Inventory Balance  
**Bluearm target:** `/app/inventory/reports` (proposed)

## Navigation quirk (tenant)

| Screen | Site-map `menuSeq` | Working hash in tenant |
|--------|-------------------|------------------------|
| Inventory Balance `E040701` | `MENUTREE_000212` | **`MENUTREE_001888`** (`C000687` hub leaf) — `MENUTREE_000212` leaves workspace blank |
| Other balance reports | per `site-map-prgids.csv` | Use listed `menuSeq` with `menuType=MENUTREE_000004` |

**Session tip:** After several hash hops the workspace iframe can freeze; reload base ERP URL then deep-link again.

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Notes |
|--------|-------|---------|-------|
| Inventory Balance | `E040701` | MENUTREE_001888 | As-of Today; populated |
| Inv. Balance by Location | `E040711` | MENUTREE_000213 | Horizontal/Vertical layout pills |
| Inv. Balance by Item Relation | `E040728` | MENUTREE_002879 | Item relation rollup |
| Inv. Book | `E040702` | MENUTREE_000215 | Stock ledger w/ price display options |
| Inventory Change History | `E040719` | MENUTREE_001713 | Summary/Daily/Monthly type |
| Inventory Aging Details | `E040727` | MENUTREE_002775 | As-of + aging buckets |
| Inv. Balance by Multi Spec. | `E040720` | MENUTREE_001796 | Spec. Group/Code 1–3 filters; Vertical default |
| Inv. balance converted by BOM | `E040726` | MENUTREE_002537 | BOM parent Item Code + as-of |
| Daily Report | `E040708` | MENUTREE_000218 | Date range + customer relation type |

---

## Inventory Balance (`E040701`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040701&menuSeq=MENUTREE_001888`

Company-wide **on-hand quantity** as-of a single date (not a range).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template **w/ Price** |

### Option panel sections

**As-of Date** (Today Jul 2026) · Location (Include Sub-groups) · Item (category sub-filters + Include Sub-groups) · **Inventory Qty** (range) · Item Relation (**Item Relation Basis** vs Based on Individual Item) · Include Items Excluded from Quantity Control · Include Deactivated Items (default checked) · **Display Items Below Safety Stock** · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings

### Toolbar

Search (F8) · Today · Prev. Day · Settings · Reset · Print · Excel

---

## Inv. Balance by Location (`E040711`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040711&menuSeq=MENUTREE_000213`

Matrix of qty by **location** (horizontal columns or vertical rows).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard layout |
| **All** | Extended type options in Option drawer |

### Type aggregation (L2 radios)

by Location (**Horizontal** default) · by Location (Vertical)

### Option panel sections

As-of Date · Location · Item · Item Relation Basis · Include Inv. Qty Zero Items · Include Zero Qty Location (disabled unless vertical) · Include Deactivated/Delete Location · **Include Safety Stock Quantity by Location** · Display Apvl. Line · **Inventory** preset button

### Toolbar

Search (F8) · Today · Prev. Day · Settings · Reset · Print · Excel

---

## Inv. Balance by Item Relation (`E040728`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040728&menuSeq=MENUTREE_002879`

Balance rolled up through **item relation** (main/sub item) hierarchy.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

As-of Date · Location · Item (category filters) · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings

### Toolbar

Search (F8) · Today · Prev. Day · Settings · Reset · Print · Excel

---

## Inv. Book (`E040702`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040702&menuSeq=MENUTREE_000215`

**Stock ledger** — opening/receipt/issue/closing qty by item over a date range. Distinct from Inventory Change History summary pivot.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard ledger columns |
| **All** | Extended price display options |

### Option panel sections

Date (default **Prev. Month + Current Month** Jun–Jul 2026) · Location · Item · Item Relation Basis · **Display Price** radios — Sales Price / Sales Price (vat Include) / Monthly Cost / Sale Price(Item) · **Cost** radios — Purchase Price / Monthly Cost / Purchase Price(Item) / Do Not Apply · Other Unit Price · Include Deactivated Items · Include Goods Issued/Location Tran. · Exclude item without transactions · Item Name (Sorting) · Display Apvl. Line

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel · **All** toolbar preset

---

## Inventory Change History (`E040719`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040719&menuSeq=MENUTREE_001713`

Pivot of **increase/decrease** columns by transaction category (not line-level Inv. Book).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Summary type |
| **All** | Daily/Monthly + display method options |

### Type aggregation (L2 radios)

**Summary** (default) · Daily · Monthly · Increase/Decrease display: Vertical / Horizontal · Display / Do not display / **Display Details**

### Option panel sections

Date range (Jun–Jul 2026 default) · Location · Item · Item Relation Basis · Based on Individual Location · Include Goods Issued/Location Tran. · Exclude Items without Transactions · **Status** toolbar preset · Display Apvl. Line

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Inventory Aging Details (`E040727`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040727&menuSeq=MENUTREE_002775`

**Aging bucket** analysis by item as-of date.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

As-of Date · Item (category filters) · Include Zero Inv. Qty · Include Items Excluded from Quantity Control · Include Deactivated Items · **Display Items Below Safety Stock by Item** · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings

### Toolbar

Search (F8) · Today · Prev. Day · Settings · Reset · Print · Excel

---

## Inv. Balance by Multi Spec. (`E040720`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040720&menuSeq=MENUTREE_001796`

On-hand qty broken out by **multi-specification** dimensions (Spec. Group/Code 1–3).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default |
| **All** | Extended sort/subtotal in Option drawer |

### Type aggregation (L2 radios)

by Multi Spec. Item (**Vertical** default) · by Multi Spec. Item (Horizontal)

### Option panel sections

As-of Date (Jul 2026) · Location (Include Sub-groups) · Item (category sub-filters + Include Sub-groups) · **Spec. Group 1 / Spec. Code 1** · **Spec. Group 2 / Spec. Code 2** · **Spec. Group 3 / Spec. Code 3** · Display Apvl. Line · Include Zero Inv. Qty (**disabled** in vertical mode) · Include Items Excluded from Quantity Control · Include Deactivated Items (default checked) · **Status** toolbar preset

### Toolbar

Search (F8) · Today · Prev. Day · Settings · Reset · Print · Excel

---

## Inv. balance converted by BOM (`E040726`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040726&menuSeq=MENUTREE_002537`

Explodes a **finished-good / BOM parent** item into component-level inventory using the bill of materials.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Only pill in tenant (no All) |

### Option panel sections

As-of Date (Today Jul 2026) · Location (Include Sub-groups) · **Item Code** (BOM parent lookup) · Template · Display Apvl. Line

### Toolbar

Search (F8) · Today · Prev. Day · Settings · Reset · Print · Excel

---

## Daily Report (`E040708`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040708&menuSeq=MENUTREE_000218`

Cross-functional **daily activity** inquiry — not a pure inventory balance screen; spans Location, Customer, Item, Dept., Project, and Mgmt. Field.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard filter set |
| **All** | Extended type / sort options |

### Option panel sections

Date range (default **This Month (~ Today)** Jul 1–7 2026) · Location · Customer · Item (category sub-filters) · Dept. · Project · Mgmt. Field · Domestic/Foreign (All/Domestic/Foreign) · **Type** — Customer Relation Standard / Based on Individual Customer / Sum of linked Customer / Sum of selected Customer · Display Apvl. Line

### Toolbar

Search (F8) · Today · Prev. Day · This Week (~ Today) · Prev. Week · This Month (~ Today) · Prev. Month · End Date · Settings · Reset · Print · Excel

**Navigation note:** After a workspace freeze, reloading base ERP URL before deep-linking avoids stale title (e.g. wrong BOM screen title on `E040708` hash).

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Inventory Balance as-of + safety-stock filter | Stock on hand report partial |
| Balance by Location horizontal matrix | No location-column pivot |
| Inv. Book with sales/purchase price columns | Stock ledger without dual price basis |
| Change History category pivot | Movement summary by doc type missing |
| Inventory Aging buckets | No aging-by-item report |
| Multi-spec balance matrix | No spec-dimension stock pivot — **crawled pass 12** |
| BOM-exploded component qty | No BOM conversion report — **crawled pass 12** |
| Daily cross-module activity report | No unified daily ops dashboard — **crawled pass 12** |

## Tab pill checklist

- [x] E040701 — Default + as-of + Inventory Qty range + safety stock (pass 11)
- [x] E040711 — Default/All + Horizontal/Vertical location type (pass 11)
- [x] E040728 — Default + item relation rollup (pass 11)
- [x] E040702 — Default/All + Display Price + Cost radios (pass 11)
- [x] E040719 — Default/All + Summary/Daily/Monthly type (pass 11)
- [x] E040727 — Default + aging as-of filters (pass 11)
- [x] E040720 — Default/All + Vertical/Horizontal multi-spec type (pass 12)
- [x] E040726 — Default only + BOM parent Item Code (pass 12)
- [x] E040708 — Default/All + customer relation type (pass 12)
