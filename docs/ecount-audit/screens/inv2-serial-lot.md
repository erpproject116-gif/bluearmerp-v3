# Inv. II — Serial/Lot No.

**Module path:** Inv. II → **Serial/Lot No.**  
**Default screen:** Serial/Lot No. Slip List (`prgId=C000092`)  
**Bluearm target:** `/app/inventory/serial-lot`  
**Audit status:** pass 18 — live crawl Jul 7 2026 (**subtree depth-complete**)

## Navigation (required)

1. Reload base ERP URL (no hash), wait ~5–8s.
2. Click **Inv. II** module tab — default lands on **Costing** (`C000140` Daily Profit Status), not Serial/Lot.
3. Click **Serial/Lot No.** L0 tab — loads **Serial/Lot No. Slip List** (`C000092`).

**Hash pattern (Inv. II Serial/Lot subtree):**

```
menuType=MENUTREE_000783&groupSeq=MENUTREE_000208&prgId={prgId}
```

| Mistake | Result |
|---------|--------|
| `menuType=MENUTREE_000208` (group only) | Opens **Costing / Daily Profit Status**, not Serial/Lot |
| Deep-link without clicking **Inv. II** first | Blank workspace or stale title |
| Rapid left-menu hops without reload | Stale title or blank iframe — wait **8–10s** per screen; reload base URL if still blank |

**Pass 18 note:** Screens marked **blocked** in pass 17 (`C000691`, `E040634`, `E040620`, `E040619`, `E041018`) all loaded successfully after proper wait. Pass 17 failures were **timing**, not missing tenant access.

## Left menu (Serial/Lot No. subtree)

| Screen | prgId | menuSeq (live) | Audit |
|--------|-------|----------------|-------|
| Reg. Serial/Lot No. | C000690 | MENUTREE_001891 | **Depth-complete** — shared list + **New (F2)** form (pass 18) |
| Serial/Lot No. Slip List | C000092 | MENUTREE_000208 | **Depth-complete** — see `C000092-serial-lot-slip-list.md` |
| Serial/Lot No. Status | E040639 | MENUTREE_001436 | **Live** — report filters below |
| Inventory Adj. by Serial/Lot No. (1st link) | C000691 | MENUTREE_001892 | **Live** — adjustment workspace (pass 18) |
| Inventory Adj. by Serial/Lot No. (2nd link) | E040634 | MENUTREE_001338 | **Live** — same UI as C000691 (pass 18) |
| Serial/Lot No. Inv. Book | E040620 | MENUTREE_000565 | **Live** — ledger report (pass 18) |
| Serial/Lot No. Inv. Balance | E040619 | MENUTREE_000566 | **Live** — balance report (pass 18) |
| Item vs. Serial/Lot No. Balance | E041018 | MENUTREE_002766 | **Live** — reconciliation report (pass 18) |

**Duplicate menu quirk:** Left menu shows **Inventory Adj. by Serial/Lot No.** twice — first navigates to `C000691`, second to `E040634`. Both render the **same adjustment workspace** in this tenant; treat as duplicate menu alias until ECount confirms otherwise.

---

## E040639 — Serial/Lot No. Status (report)

**URL:** `prgId=E040639`, `menuSeq=MENUTREE_001436`, `groupSeq=MENUTREE_000208`

### L2 option pills

| Pill | Notes |
|------|-------|
| **Default** | Saved filter template |

### Type / layout

| Control | Options |
|---------|---------|
| Type | **Details** (default) · **Summary** |
| Summary layout | **by Line** button (when Summary) |

### Filters (Default pill)

- **Date** — This Month (~ Today); simple-search presets (Today, Prev. Day, This Week, Prev. Week, This Month, Prev. Month, End Date, Reset)
- **Terms of Validity** — optional range (`== / / ====` placeholders when unused)
- **Serial/Lot No.** — lookup
- **Location** — include sub-groups
- **Item** — category tree (Raw Material … Intangible Merchandise) + include sub-groups
- **Slip Type** — lookup
- **Template** — Applied Template Default (Not Editable)
- **Display Apvl. Line** — checkbox
- **Sort/Subtotal Criteria** — Settings link

### Toolbar

Search (F8), Print, Excel, Email, Option, Help

---

## C000690 — Reg. Serial/Lot No.

**URL:** `prgId=C000690`, `menuSeq=MENUTREE_001891`

Left-menu **Reg. Serial/Lot No.** sets `prgId=C000690` but workspace title remains **Serial/Lot No. Slip List** (shared list template with C000092). List filters, slip-type pills All + 1–10, and toolbar **Delete Selected / Excel** match C000092 — see `C000092-serial-lot-slip-list.md`.

### List toolbar (shared shell)

New (F2), Delete Selected, Excel, Search(F3), Option, Help

### New (F2) — registration modal (pass 18)

Opens overlay form (~8s after click). **Not** the list-settings drawer (unlike some Inv. I list screens).

#### Form tab

| Tab | Notes |
|-----|-------|
| **Input Serial/Lot No. Details** | Only tab visible on new entry |

#### Header fields

| Field | Control | Notes |
|-------|---------|-------|
| **Date** | Month / day / year pickers | Default **07 / / 2026** (today) |
| **Slip Type** | Dropdown pill | Default **Quotation**; see slip-type list below |
| **Location** | Code + lookup + readonly name | |
| **Item Code** | Code + lookup + readonly name | |
| **Qty.** | Numeric | |
| **Serial/Lot No.** | Text + lookup + readonly name | Primary serial identifier |
| **Remark** | Text | |
| **Project** | Code + lookup + readonly name | |

#### Slip Type options (New F2 dropdown)

Quotation · Sales Order · Sales · Shipping Order · Shipping · Purchase Order · Purchases · Goods Receipt · Consumed · Repair Order · Repair · Location Tran. · Goods Issued · Internal Use · Defect-Disassemble (Defect Item) · Defect-Disassemble (Normal Item) · Defect-Usable · Defect-Dispose · Create Quality Insp. Request · Quality Inspection · Invoice/Packing List

#### Form toolbar

Save (F8), Reset, Close, **ECOUNT Web Uploader**, Option

#### Form Option menu

Input Screen Settings · Condition Template Settings · My Code/Text Settings · Function Setup

---

## C000691 / E040634 — Inventory Adj. by Serial/Lot No.

**URLs:** `C000691` (`menuSeq=MENUTREE_001892`) · `E040634` (`menuSeq=MENUTREE_001338`)

**Screen type:** Adjustment **workspace** (not a slip list). Both duplicate menu links render identical UI.

### Option Default filters

- **Terms of Validity** — optional date range
- **Serial/Lot No.** — lookup
- **Location** — lookup + include sub-groups
- **Item** — category tree (All · Raw Material · Sub Material · Finished Goods · Semi-Finished Goods · Merchandise · Intangible Merchandise) + include sub-groups
- **Inventory Qty** — checkbox pills: **All** · **1** · **0** · **Others**
- **Include Unassigned Locations** — checkbox

### Toolbar

Search (F8), Reset, Apply, **Save (F8)**, Option, Help

Grid body for line-level serial adjustments loads after Search/Apply (not fully expanded this pass).

---

## E040620 — Serial/Lot No. Inv. Book

**URL:** `prgId=E040620`, `menuSeq=MENUTREE_000565`

Ledger-style movement book for serial/lot units.

### L2 option pills

| Pill | Notes |
|------|-------|
| **Default** | Saved filter template |
| **All** | Extended template drawer |

### Type

| Control | Options |
|---------|---------|
| Type | **General** (default) · **Summary by Serial/Lot No.** |

### Filters (Default pill)

- **Date** — **Prev. Month** + **Current Month** presets; range sample 06–07/2026
- **Terms of Validity** — optional range
- **Serial/Lot No.** · **Location** · **Item** (category tree + sub-groups)
- **Inventory Qty** — All · 1 · 0 · Others
- **Others:** Display Apvl. Line · Include Deactivated Serial/Lot · Include Goods Issued/Location Tran. · Exclude Items without Transactions
- **Extended Option sections:** Text Type · Code Type · Numeric Type · Date Type custom fields (tenant-defined add fields)

### Toolbar

Search (F8), date presets, Print, Excel, Option, Help

---

## E040619 — Serial/Lot No. Inv. Balance

**URL:** `prgId=E040619`, `menuSeq=MENUTREE_000566`

Point-in-time balance by serial/lot.

### Type

| Control | Options |
|---------|---------|
| Type | **Serial/Lot No.** (default) · **Serial/Lot No. (By Location)** |

### Filters

- **Date** — **Today** (07/2026 sample)
- **Terms of Validity** · **Serial/Lot No.** · **Location** · **Item** (category tree)
- **Inventory Qty** — All · 1 · **Others** (no **0** pill — differs from Inv. Book)
- **Others:** Display Apvl. Line · **Include Deactivated Serial/Lot** (checked by default)
- **Sort/Subtotal Settings**
- **Option extended sections:** Text/Code/Numeric/Date Type custom field filters

### Toolbar

Search (F8), date presets, Print, Excel, Option, Help

---

## E041018 — Item vs. Serial/Lot No. Balance

**URL:** `prgId=E041018`, `menuSeq=MENUTREE_002766`

Reconciliation report comparing item inventory qty vs serial/lot unit counts.

### Compare by

| Control | Options |
|---------|---------|
| Compare by | **Serial/Lot No.** (default) · **Item** |

### Filters

- **Date** — Today
- **Location** · **Item**
- **Template** — Applied Template Default (Not Editable)
- **Display Apvl. Line**
- **Sort/Subtotal Settings**

### Toolbar

Search (F8), date presets, **Print**, Excel, Option, Help

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Slip type pills All + 1–10 on C000092 | Serial history by source doc type |
| Serial/Lot Status report (E040639) | Serial movement inquiry / ledger views |
| Inv. Book (E040620) / Balance (E040619) | Serial unit ledger + balance APIs + UI |
| Item vs. Balance (E041018) | Item qty vs serial-unit reconciliation report |
| Inventory Adj. by Serial/Lot (C000691 / E040634) | Stock adjustment scoped to serial units |
| Reg. Serial New (F2) slip-type + line fields | Manual serial registration / orphan serial entry |
| Linked Slip vs Set Manually filter | Distinguish slip-originated vs manual serial rows |

## Tab pill checklist

- [x] L0 Serial/Lot No. tab (Inv. II)
- [x] C000092 slip-type pills All + 1–10 (pill **1** clicked live; 2–10 same pattern)
- [x] C000092 Option Default (Date, Terms of Validity, Item, Linked Slip / Set Manually, Sort, Template)
- [x] E040639 Default + Details/Summary type
- [x] C000690 New (F2) — Input Serial/Lot No. Details tab + Slip Type dropdown
- [x] C000691 / E040634 adjustment workspace Option Default
- [x] E040620 Default/All + General/Summary by Serial/Lot No.
- [x] E040619 Serial/Lot No. / By Location type
- [x] E041018 Compare by Serial/Lot No. / Item
