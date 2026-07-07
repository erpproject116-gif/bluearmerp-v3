# Inv. II — WMS, Export, Order Mgmt, Plan Mgmt (breadth pass 1)

**Module:** Inv. II horizontal tabs  
**Audit status:** pass 4 — live crawl Jul 7 2026 (Export status report + Order Mgmt detail modal + Site Map prgId registry)

## Inv. II L0 tabs (header)

After-Sales Service · Serial/Lot No. · Quality Control · **Plan Mgmt** · Costing · **Order Mgmt** · **Export** · **WMS**

---

## WMS (L0 tab)

| Attribute | Value |
|-----------|-------|
| **prgId** | `C000904` |
| **menuSeq** | `MENUTREE_001959` |
| **groupSeq** | `MENUTREE_001959` |
| **depth** | 2 |

### Left sub-menu (cataloged live)

| Program | Notes |
|---------|-------|
| Select WMS Account | Master ID assigns permitted WMS accounts |
| Warehouse Mgmt | Warehouse master for WMS |
| **Receipt Mgmt** | Inbound workflow subtree |
| → Scheduled Receipt | Planned inbound |
| → Scheduled Receipt Status | Status inquiry |
| → Process Receipt | Execute receipt |
| → New (Increase) | Manual stock increase |
| **Release Mgmt** | Outbound workflow subtree |
| → Scheduled Release | Planned outbound |
| → Scheduled Release Status | Status inquiry |
| → Process Release | Execute release |
| → New (Decrease) | Manual stock decrease |
| WMS Inventory Adjustment | WMS-level qty adjustment |
| WMS Inventory Balance | Balance inquiry |
| Inventory History Mgmt | Movement history |

### Tenant state (BLUEARM)

**No permitted WMS Account.** Message: *You can set the WMS Account with the Master ID.* — screens beyond account selection not accessible without WMS license/setup.

### Bluearm target

Future `/app/inventory/wms` — warehouse scheduling, receipt/release, WMS balance separate from Inv. I location stock.

---

## Export (L0 tab)

| Attribute | Value |
|-----------|-------|
| **L0 hub prgId** | `C000652` |
| **List prgId** | `E040905` (Site Map leaf — same screen as hub default) |
| **Status prgId** | `E040907` |
| **menuSeq** | `MENUTREE_001395` (hub) · `MENUTREE_002765` (status) |

### Left sub-menu

| Program | Notes |
|---------|-------|
| **Invoice / Packing List** | Default landing (this screen) |
| Invoice/Packing List Status | Status inquiry |

### Invoice / Packing List — list screen

**L2 status pills:** All · Unconfirmed · Confirm

| Column | Notes |
|--------|-------|
| Voucher Date | |
| Customer/Vendor Name | |
| Item Name | |
| Invoice No. | |
| Invoice Date | |
| Foreign Currency Name | |
| Total Amount | |
| Print Invoice | Print link |
| Print P/L | Packing list print |

**Toolbar:** Search (F3), Option, Help, **New (F2)**, Email, Change Status, Send, Print Invoice, Barcode (Item), Delete Selected, View Mapping, Excel

**Option dropdown** (title bar — not filter pills): Search Field Settings · Template Settings · Condition Template Settings · Sent Doc. History · List Tab Settings

**New (F2):** Opens nested **`Input Invoice/Packing List`** modal (AMD module `ESD028M`; parent list stays `C000652`).

**Empty state:** `No data has been registered.`

### Invoice/Packing List Status (`E040907`) — inquiry report

**L2 filter pills:** Default · Type · Details · Summary · **by Line**

| Filter section | Fields |
|----------------|--------|
| Date | Range — This Month (~ Today) default |
| Invoice No. / Invoice Date | Invoice Date has **Do Not Use** toggle |
| L/C No. / L/C Date | L/C Date **Do Not Use** toggle |
| Customer / Item | Lookups |
| Template | Applied Template · Template Type |
| Others | Display Apvl. Line · Sort/Subtotal Criteria · Data View Format · **View as Graph** |

**Date quick buttons:** Today, Prev. Day, This Week, Prev. Week, This Month, End Date, Reset — **Search (F8)**

**Footer:** Print, Excel, Email

### Input Invoice/Packing List — new form (F2 child modal)

| Header field | Notes |
|--------------|-------|
| Date | Voucher date |
| Customer | Lookup |
| Invoice No. / Invoice Date | |
| L/C No. / L/C Date / L/C Issuing Bank | Letter of credit block |
| Shipper/Exporter | |
| For Account & Risk of Messrs | |
| Notify Party | |
| Port of Loading / Final destination | |
| Carrier / Estimated Departure | |
| Currency | Domestic default |
| Weight Unit / Remarks | |

**Line toolbar:** Find (F3), Sort, **My Item**, **Sales**, **Sales Order**, Barcode, Slip Barcode, **Load Slip**

| Line column | Notes |
|-------------|-------|
| Mark & Number of PKGS | |
| Item Code / Item Name / Description of Goods | |
| Qty / Unit / Price / Pretax Amount | |
| Net Weight / Gross Weight / Measurement | |
| Serial/Lot No. | |

**Actions:** Save (F8), **Save/Invoice (F7)**, Reset, Close

**Option dropdown:** Input Screen Settings (Default | Mobile templates), Condition Template Settings, My Code/Text Settings, Function Setup, Mapping Center, Change Progress Status Settings

### Bluearm target

Future export documentation module — invoice/packing for international shipments.

---

## Order Mgmt (L0 tab)

| Attribute | Value |
|-----------|-------|
| **L0 hub prgId** | `C000651` |
| **Process list** | `E040901` |
| **Status list** | `E040904` |
| **menuSeq** | `MENUTREE_001390` (hub) |

### Left sub-menu (live)

| Program | prgId | Notes |
|---------|-------|-------|
| **Reg. Order Mgmt Process** | `E040901` | Process definition list (audited pass 3) |
| **Order Mgmt Status** | `E040904` | Status list (audited pass 2) |

Site Map also lists **Order Confirmation** (`E041006`), **Delivery** (`E041007`), Cancel, Return, Exchange, ERP Transmission — those live under **Inv. I → Online Store Mgmt** (`C000665`), not Inv. II Order Mgmt. BLUEARM tenant Inv. II left menu shows only **Reg. Order Mgmt Process** + **Order Mgmt Status**.

**Note:** Distinct from Inv. I → Online Store Mgmt → Order Mgmt (e-commerce orders).

### Order Mgmt Status (`E040904`) — list screen

| Column | Notes |
|--------|-------|
| Order Mgmt No. | e.g. `00207` |
| S/N: | Serial / reference no. |
| Customer Name | |
| Order Mgmt Name | Item or order description |
| Date | |
| Progress Status | Inline doc-type chips with counts |
| Details | **View** link |

**Progress Status chips** (per row): Sales (n), Purchases (n), Location Trans. (n), Product Defect (n), Sales Order (n) — shows linked slip counts by type.

**Toolbar:** Search (F3), Option, Help, New (F2), Deactive/Reactivate, Finish All Steps, View selection details

Tenant has **populated rows** (6+ orders in sample).

### Reg. Order Mgmt Process (`E040901`) — process definition list

| Column | Notes |
|--------|-------|
| Type Code | e.g. `00001` |
| Type Name | e.g. `RMA - Product Defect > Onstock Item (Not Sold)` |
| 1 Step … 10 Step | Document type per workflow step — **Purchases**, **Sales**, **Location Trans.**, **Product Defect**, **Sales Order**, **Internal Use**, etc. |
| Usage Status | Yes / blank |
| Enable in input menu | |
| PIC (×10) | Person in charge per step |

**Toolbar:** Search (F3), Option, Help, New (F2), Deactive/Reactivate

Tenant has **10+ RMA/fulfillment process templates** configured (heavy use of Sales → Location Trans. → Product Defect chains).

**New (F2):** Opens **Slip** submenu (list-settings — inline process editor not opened in pass 3).

### Order Mgmt Status — **View** detail modal

Clicking **View** on a row opens **Details by Order Mgmt No.** modal:

| Section | Notes |
|---------|-------|
| Header | Order Mgmt No. + Order Mgmt Name |
| Step columns | 1 Step … 5 Step (from process template — e.g. Purchases, Location Trans., Product Defect) |
| Loading Criteria | Per-step slip type filter |
| Progress Status | **Completed** / **In Progress** / **Stand by** per step |
| Line grid | Item Code/Name/Spec. · Input Qty · Standard Qty · Balance Qty per step |

**Actions:** Excel, Close

### Bluearm target

`/app/selling/order-management` — fulfillment tracking across sales/purchase/location slips.

---

## Plan Mgmt (L0 tab)

| Attribute | Value |
|-----------|-------|
| **prgId** | `C000094` |
| **menuSeq** | `MENUTREE_000210` |
| **groupSeq** | `MENUTREE_000210` |
| **depth** | 2 |
| **Default screen** | Sales Forecast List |

### Left sub-menu (live)

| Subtree | Programs |
|---------|----------|
| **Sales Forecast** | Sales Forecast Input Screen · **Sales Forecast List** · Sales Forecast Status · Sales vs. Sales Forecast |
| **Project Plan** | Project Plan List · Plan vs. Actual · Project Status |

### Sales Forecast List (`C000094`) — list screen

**L2 status pills:** All · History

| Column | Notes |
|--------|-------|
| Date-No. | |
| Customer/Vendor Name | |
| PIC Name | |
| Location Name | |
| Project Name | |
| Item Name | |
| Amount | |

**Toolbar:** Search (F3), Option, Help, New (F2), Send, Delete Selected, Excel

**Empty state:** `No data has been registered.`

### Sales Forecast Input Screen (`E040624`)

| Attribute | Value |
|-----------|-------|
| **prgId** | `E040624` |
| **menuSeq** | `MENUTREE_000570` |
| **depth** | 4 |

| Header | Notes |
|--------|-------|
| Forecasted Sales Date | Single date (default today) |

**Line toolbar:** Find (F3), Sort, **My Item**

| Line column | Notes |
|-------------|-------|
| Item Code / Item Name | |
| Amount | |
| Remark | |

**Actions:** Save (F8), Reset, **List** (back to forecast list), ECOUNT Web Uploader

### Bluearm target

Planning / forecasting module — not in Bluearm today.

---

## Tab pill checklist

- [x] WMS left sub-menu tree (14 programs)
- [x] WMS tenant license gate observed
- [x] Export — Invoice/Packing List list columns + status pills
- [x] Order Mgmt — `E040904` Order Mgmt Status list + progress chips
- [x] Plan Mgmt — `C000094` Sales Forecast List + left sub-menu
- [x] Export — Input Invoice/Packing List form (F2 modal, `ESD028M`)
- [x] Order Mgmt — `E040901` Reg. Order Mgmt Process list (10-step workflow grid)
- [x] Plan Mgmt — `E040624` Sales Forecast Input Screen form
- [x] Export — Invoice/Packing List Status `E040907` filter pills
- [x] Order Mgmt — View detail modal (step progress grid)
- [x] Site Map prgId registry — `site-map-prgids.csv` (670 programs)
- [ ] Online Store Order Confirmation `E041006` / Delivery `E041007` (Inv. I subtree)
