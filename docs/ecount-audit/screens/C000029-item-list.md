# C000029 — Item List

**Menu path:** Inv. I → Setup → Item  
**URL:** `prgId=C000029` (tenant alias **`E040103`**), `menuSeq=MENUTREE_000174`, `depth=3`  
**Bluearm target:** `/app/inventory/items`  
**Audit status:** pass 7 — live crawl Jul 7 2026 (**item 00002 edit panel + Inv. Count I Adjust flow**)

## Tab pill map (mandatory)

See `tab-pills.csv` for full registry. Summary:

### L0 — Inv. I module bar

| Pill | prgId when clicked | Notes |
|------|-------------------|-------|
| Setup | C000029 | Item List (this screen) |
| Sales | TBD | Different program tree |
| **Purchases** | **C000031** | Purchase List — Review Purchases area |
| Production | TBD | |
| Inv. Mov. | TBD | |
| Online Store Mgmt | TBD | |
| Reports | TBD | |

### L2 — Option filter pills (list toolbar → Option)

Default · Item Information · Qty · Price · Cost · Additional Information · Management

### L2 — Inline New/Edit form pills (New F2)

Same seven pills as Option filter. **Fields differ per pill** — must not merge in Bluearm.

#### Form → Qty pill (audited)

- Aux. Qty Unit Conversion Ratio
- Safety Stock Quantity; Safety Stock Quantity Set by Location
- Safety Stock Control per document: Sales Order, Sales, Goods Issued, Goods Receipt, Location Tran., Internal Use, Product Defect (Use / Do Not Use each)
- C-Portal Min. S/O Qty Check; C-Portal Min. S/O Unit; C-Portal Min. S/O Qty
- Inventory Qty Enter
- Lead Time; Min. Purchase Qty; Vendor

#### Form → Cost pill (audited)

- O/E Price
- Standard Labor Time (Wage-Weighted)
- Weight for Allocating Overhead Cost
- Standard Material / Expenses / Labor / O/E Cost

#### Form → Additional Information pill (audited)

- Text Type Add. Field 1–6
- Number Type Add. Field 1–10

#### Form → Management pill (audited)

- Serial/Lot: Default Settings (Optional/Required) vs Use / Do Not Use (multiple radio groups)
- Auto-Create Manufacture Slip — Sales; Location Tran.
- Auto-Create Quality Insp. Request — Purchases; Goods Receipt
- Quality Inspection Type; QC Inspection Method (Lot / Sampling %)

## Screen purpose

Master list of inventory items with inline search, advanced filters, bulk toolbar actions, and **inline New/Edit panel** (not a separate route).

## List columns (default)

| Column | Sortable | Notes |
|--------|----------|-------|
| Checkbox | — | Multi-select |
| Item Code | Yes | Link opens item |
| Item Name | Yes | Link |
| Purchase Price | Yes | |
| Sale Price | Yes | |
| VIP Price | Yes | |
| Active | Yes | Usage status |

## List view tab pills (L2 — column templates)

Numbered tabs **1–10** above grid (+ gear for List Tab Settings). Same pattern as Purchase List tabs 1–6.

## Toolbar buttons (live Jul 2026)

| Button | Action observed |
|--------|-----------------|
| New (F2) | Opens **inline entry panel** with 7 form tabs + Save (F8) |
| (icon) | Copy / duplicate |
| Barcode | Barcode management |
| Relation Settings | Related-item settings |
| Level Group | Item level group |
| Change | Bulk field change |
| Inv. Adj. | Inventory adjustment shortcut |
| Deactive/Reactivate | Toggle usage status |
| Excel | Import/export |
| (overflow) | Additional actions |

**Requires row checkbox selection** for Barcode, Inv. Adj., Relation Settings (notice if none selected).

### Barcode modal (toolbar → Barcode)

Opens **`Barcode (Item)`** dialog for checked rows:

| Column | Notes |
|--------|-------|
| Qty | Print quantity |
| Item Code / Item Name / Spec. | From selected item |
| Barcode | Barcode value (editable) |

Actions: **Option** (page-level dropdown — Template Settings, Search Field Settings, Function Setup; same as list screen Option, not barcode-specific), **Print Barcode**, **Close**

Sample row (item `00002` EPSON L3216): Barcode column empty; Qty defaults to 1.

### Inv. Adj. modal (toolbar → Inv. Adj.)

Opens **`Inv. Count I`** shortcut dialog (requires checkbox row selection):

| Field | Notes |
|-------|-------|
| Date | Voucher date (default today — `07/07/2026` in sample) |
| Location | Warehouse/location picker (initial screen) |
| Adjust | Expands inline count grid for selected item(s) |

**After Adjust** — grid expands in same modal (no nested dialog):

| Column | Notes |
|--------|-------|
| PIC | Person in charge |
| Item Code / Item Name / Spec. | From selected item |
| Location columns | One column per warehouse — tenant sample: Cebu City Branch, DISTRI, HQ, Mandaue City Branch, RMA CEBU, RMA HQ, RMA MANDAUE, Sample Factory |
| Qty per location | Editable count per location — `0` in all locations for `00002` sample |

Actions: **Save (F8)**, **Close**

Routes to inventory count/adjustment workflow — location-level qty entry, not a single-location shortcut only.

### Relation Settings modal (toolbar → Relation Settings)

Opens **`Item Relation List`** dialog:

| Column | Notes |
|--------|-------|
| Main Item Code / Name / Unit (Major Item) | Parent item |
| Linked Item Code / Name / Unit (Linked Item) | Related item |
| Quantity Converted to a Linked Item | Conversion qty |
| Quantity Converted to a Main Item | Reverse conversion |
| Quantity Control Basis | Basis for qty control |

Toolbar: Search (F3), New (F2), Change, Delete Selected, Excel, ECOUNT Web Uploader, Close

Empty state: `No data has been registered.`

#### List Option filter pills (Default / All)

| Section | Fields |
|---------|--------|
| Main Item Code | Select lookup |
| Linked Item Code | Select lookup |
| Quantity Control Basis | All · Main Item · Individual Item |
| Others | Sort by Modified Date |

**New (F2)** opens nested **`Register Item Relation`** modal (not an inline grid row). Modal body may stay blank until AMD bundle loads — use title-bar **Open in new window** for reliable inspection.

### Register Item Relation (New F2 child modal)

| Attribute | Value |
|-----------|-------|
| **prgId** | `C001130` |
| **Standalone URL** | `ec3/view/SVC/ESA/ESA009P_17_01?is_standalone=true` |
| **formType** | `SI903` |
| **Parent** | Item Relation List (Relation Settings on Item List) |

#### Header fields

| Field | Control | Notes |
|-------|---------|-------|
| Main Item | Code search + popup (`btn-code-search`) | Parent/bundle item for all linked lines |
| Quantity Control Basis | Radio | **Main Item** (`R`) · **Individual Item** (`I`) — default **Individual Item** |

#### Line grid

Toolbar: **Find (F3)** — item lookup for linked lines.

| Column | Notes |
|--------|-------|
| Row # | 1, 2, 3 … (three blank rows on new) |
| Expand | Per-row dropdown (line actions) |
| Linked Item Code | Component/related item code |
| Linked Item Name | Read-only after lookup |
| Spec. | Specification |
| Linked Item Qty | Qty of linked item per conversion |
| Main Item Qty | Qty of main item per conversion |
| Bom Synchronization | Per-row checkbox; header checkbox = select all |

#### Actions

| Action | Notes |
|--------|-------|
| Option | Form layout — **Default Setting** only (standalone `C001130` pass 7) |
| Save (F8) | Persist relation set for main item |

#### Option panel (`C001130`)

Title-bar **Option** dropdown → **Default Setting** (form layout / field visibility — no additional filter pills).

**Include Deactivated** toggle on list header filters inactive items.

**Populated example (bundle `00006`):** Relation Settings with row `00006` checked → list still **empty**. **Global Relation Settings search (no filter)** also returns `No data has been registered.` — tenant has bundle items (`00006`, `00011`, `00012`) but **zero Item Relation rows** registered in ECount.

## Edit item panel (click Item Code link)

Opens **`Item`** modal (same 7 pills as New F2). Audited on **`00002`** (EPSON L3216 ALL IN ONE PRINTER).

**Actions:** Save (F8), Copy, Deactive/Reactivate, Reset, Close, **Option** (title bar)

| Tab | Fields observed (edit `00002`) |
|-----|-------------------------------|
| Default | Item Code `00002`, Item Name, Item Group 1, Spec (Name/Group/Calculation modes), Unit, Item Category radios, Bundle Item Status (Use/Do Not Use), Inv. Quantity Management, Inventory Qty Enter, Production Process, Purchase/Sale/VIP Price + Tax Included |
| Item Information | Same core identity fields as Default **plus** Tax Rate (Sales/Purchases) %, Barcode, Keyword, Enable Item Sharing / Share with C-Portal, Image Insert, File, Item Group 1–3, Remark, Quality Inspection Type, QC Inspection Method, Lot, Sampling(%), Item Level Group |
| Qty | C-Portal Min. S/O Qty, Aux. Qty Unit Conversion Ratio, Safety Stock Control per doc (Sales Order, Sales, Goods Issued, Goods Receipt, Location Tran., Internal Use, Product Defect), Safety Stock Quantity Set by Location, C-Portal Min. S/O Qty Check/Unit, Inventory Qty Enter, Lead Time, Min. Purchase Qty, Vendor |
| Price | Purchase/Sale/VIP + Tax Included; **Price B–J** each with Tax Included |
| Cost | O/E Price + Tax Included, Standard Labor Time (Wage-Weighted), Weight for Allocating Overhead Cost, Standard Material/Expenses/Labor/O/E Cost |
| Additional Information | Text Type Add. Field 1–6; Number Type Add. Field 1–10 |
| Management | Mgmt Field (Default/Required/Optional/Do Not Use), Serial/Lot No. policy, Create Manufacture Slip Target (Sales, Location Tran.), Quality Insp. Request Target (Purchases, Goods Receipt) — each with Default Settings + Use/Do Not Use radios |

**Edit vs New (F2):** Same 7-tab structure; edit adds **Copy**, **Deactive/Reactivate**; Item Information tab is richer than Default on edit (tax, barcode, QC, sharing, image).

## Search & filters

- Quick search: textbox “Input and press [Enter]” + **Search (F3)**
- **Include Deactivated** toggle
- **Option** button opens multi-section filter builder:

### Filter sections

1. **Default** — basic item fields
2. **Item Information** — code, name, spec, unit, category, item type, usage status, dates, creator
3. **Qty** — safety stock by document type (SO, sales, GI, GR, location transfer, internal use, defect)
4. **Price** — purchase/sale/VIP and Price B–J, O/E price ranges
5. **Cost** — standard material/labor/OH costs, allocation weights
6. **Additional Information** — text/number custom fields (1–10), remark, barcode, keyword
7. **Management** — serial/lot, QC inspection, auto-create manufacture/quality flags, vendor, lead time, min PO qty

### Notable filter fields (parity candidates)

- Item Category: Raw Material, Sub Material, Finished Goods, Semi-Finished Goods, Merchandise, Intangible Merchandise
- Item Type: Item, Multiple Process Item, Multi Spec. Item
- Inv. Quantity Management: Use / Do Not Use
- Serial/Lot No.
- Bundle Item Status
- Item Group 1–3
- Tax Rate (Sales) / (Purchases)
- Auto-Create Quality Insp. Request — Purchases / Goods Receipt
- Auto-Create Manufacture Slip — Sales / Location Transfer

## Inline New item panel (F2)

Opens overlay `wrapper-form` on same page with tabs:

| Tab | Fields observed |
|-----|-----------------|
| Default | Item Code, Item Name, Item Group 1, Spec (Name/Group/Calculation modes), Unit |
| Item Information | Category radios, Inv. Qty Management, Production Process |
| Qty | (tab present — not expanded in pass 1) |
| Price | Purchase / Sale / VIP + Tax Included checkboxes |
| Cost | (tab present) |
| Additional Information | (tab present) |
| Management | (tab present) |

**Actions:** Save (F8), Reset, ECOUNT Web Uploader, Close

### Default tab fields (sample)

- Item Code, Item Name, Item Group 1
- Spec mode: Spec. Name | Spec. Group | Spec. Calculation | Spec. Calculation Group
- Unit
- Item Category (radio): Raw Material, Sub Material, Finished Goods, Semi-Finished Goods, Merchandise, Intangible Merchandise
- Inv. Quantity Management: Use / Do Not Use
- Production Process picker
- Purchase Price, Sale Price, VIP Price (each with Tax Included)

## Row interactions

- Item Code / Item Name are links (open detail/edit)
- Header checkbox for select-all
- Per-row checkbox

## Pagination

- Numeric pages 1–10+ with next/prev links

## Cross-module links (from setup menu, not item row)

- Price Mgmt subtree
- Change Code
- Foreign Currency

## Business rules (observed live)

- Bundle items use `Bundle:` name prefix (e.g. `00006`, `00011`)
- Service/intangible items use `INHOUSE:` prefix (e.g. `00015`)
- Item codes mix numeric (`00002`) and alphanumeric (`101BKB`) patterns

## Bluearm gaps (initial)

| ECount | Bluearm today | Priority |
|--------|---------------|----------|
| 7 filter sections + 50+ optional columns | Basic item list + form fields | P1 |
| Price B–J levels | Price lists partially | P2 |
| Item level group / relation settings | Limited | P2 |
| Inline list + bottom form UX | Separate list/modal pages | P3 |
| QC auto-create on purchase/GR | Quality module partial | P2 |
| Safety stock per document type | Single reorder logic? | P2 |
| Excel bulk upload on list | Data Center import | P1 |
| Barcode button on list | Serial/lot module | P1 |
| Inv. Adj. from item list | Stock entries | P1 |
| Multi spec / process item types | track_serial, bundles | P1 |
| List view tabs 1–10 | Saved column views | P2 |

## Next steps (pass 9)

1. Site Map → systematic `coverage-matrix.csv` prgId mapping (832 programs).
2. Order Mgmt Confirmation / Delivery subtrees.
3. Acct. II e-Contract tab + New forms (Billing Note, Withholding, AR/AP payment).
4. Export Invoice/Packing List Status inquiry.
