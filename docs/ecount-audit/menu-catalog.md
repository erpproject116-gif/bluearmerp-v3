# ECount menu catalog (in progress)

Captured from live session. Inv. I **L0 breadth pass complete** (Jul 2026).

## Top-level modules (header)

| Module | Notes |
|--------|-------|
| Inv. I | Inventory I — setup, sales, purchases, production, movements, online store, reports |
| Inv. II | Serial/lot, QC, costing, WMS — **L0 breadth pass 2** |
| Acct. I | GL, vouchers, FS reports — **L0 breadth pass started** |
| Acct. II | AR/AP, budget, expenses — **L0 breadth pass 2** |
| Mgmt | Payroll/HR — **L0 breadth pass 1** |
| GW | Groupware — **L0 breadth pass 1** (not licensed) |
| Data Center | Import / integration — **L0 breadth pass 1** |

## Inv. I horizontal tabs (module level) — **cataloged**

Each L0 tab switches the entire left menu and loads a default `prgId`:

| L0 tab | Default prgId | Default screen | Screen doc |
|--------|---------------|----------------|------------|
| Setup | C000029 | Item List | `screens/C000029-item-list.md` |
| Sales | C000030 | Sales List | `screens/C000030-sales-list.md` |
| Purchases | C000031 | Purchase List | `screens/C000031-purchase-list.md` |
| Production | C000032 | Goods Receipt List | `screens/C000032-goods-receipt-list.md` |
| Inv. Mov. | C000033 | Location Tran. List | `screens/C000033-location-tran-list.md` |
| Online Store Mgmt | C000654 | Register Online Store | `screens/C000654-online-store.md` |
| Reports | C000035 | Reports hub | `screens/C000035-reports-hub.md` |

## Inv. I → Setup (left sub-menu)

| Link | Bluearm equivalent | Audited |
|------|-------------------|---------|
| Customer/Vendor | `/app/inventory/partners` | |
| Location | `/app/inventory/locations` | |
| Project | `/app/inventory/projects` | |
| Department | `/app/inventory/departments` | |
| **Item** | `/app/inventory/items` | **C000029** |
| Mgmt. Field | Custom fields | |
| Price Mgmt | `/app/inventory/price-lists` | |
| Price Apply Order Settings | — | |
| Price Level Registration | — | |
| Price Level Group by Customer/Vendor | — | |
| Price by Item | — | |
| PIC/Employee | HR / users | |
| Approval Line for Print (Inv.) | Print approval | |
| Foreign Currency | `/app/quotation/currencies` | |
| Change Code | Code change utility | |

## Inv. I → Setup → Price Mgmt (nested)

- Price Apply Order Settings
- Price Level Registration
- Price Level Group by Customer/Vendor
- Price by Item

## Inv. I → Sales (left sub-menu summary)

Quotation · Sales Order (**New Sales Order `E040203`** — `screens/E040203-new-sales-order.md`) · Sales (list/**New Sales `E040205`**/status/AR) · Collective Invoicing · Shipping Order · Shipping

See `screens/C000030-sales-list.md` for full tree.

## Inv. I → Purchases (left sub-menu summary)

Purchase Request · Purchase Plan · RFQ · Purchase Order (**New PO `E040301`** — `screens/E040301-new-purchase-order.md`) · Purchases (review invoices) · Collective Invoicing

See `screens/C000031-purchase-list.md` for full tree.

## Inv. I → Production (left sub-menu summary)

BOM · Process · Production Plan/MRP · Job Order · Goods Issued · Job · Goods Receipt · O/E Invoicing

See `screens/C000032-goods-receipt-list.md` for full tree.

## Inv. I → Inv. Mov. (left sub-menu summary)

Location Tran. · Internal Use · Product Defect · Inv. Adj.

See `screens/C000033-location-tran-list.md` for full tree.

## Inv. II horizontal tabs (module level) — **cataloged**

| L0 tab | Default prgId | Default screen | Screen doc |
|--------|---------------|----------------|------------|
| After-Sales Service | — | (not opened) | — |
| Serial/Lot No. | C000092 | Serial/Lot No. Slip List | `screens/inv2-serial-lot.md` |
| Quality Control | — | (menu catalog only) | `screens/inv2-quality-control.md` |
| Plan Mgmt | C000094 | Sales Forecast List | `screens/inv2-wms-export-order-plan.md` |
| Costing | C000140 | New Costing (Monthly Profit) | — |
| Order Mgmt | E040904 | Order Mgmt Status | `screens/inv2-wms-export-order-plan.md` || Export | C000652 | Invoice / Packing List | `screens/inv2-wms-export-order-plan.md` |
| WMS | C000904 | Select WMS Account | `screens/inv2-wms-export-order-plan.md` |

## Inv. II → Serial/Lot No. (left sub-menu) — **pass 18 depth-complete**

| Screen | prgId | Doc |
|--------|-------|-----|
| Reg. Serial/Lot No. | C000690 | `screens/inv2-serial-lot.md` — New F2 form pass 18 |
| Serial/Lot No. Slip List | C000092 | `screens/C000092-serial-lot-slip-list.md` |
| Serial/Lot No. Status | E040639 | `screens/inv2-serial-lot.md` |
| Inventory Adj. by Serial/Lot No. (×2 links) | C000691 / E040634 | `screens/inv2-serial-lot.md` — same adj workspace pass 18 |
| Serial/Lot No. Inv. Book | E040620 | `screens/inv2-serial-lot.md` |
| Serial/Lot No. Inv. Balance | E040619 | `screens/inv2-serial-lot.md` |
| Item vs. Serial/Lot No. Balance | E041018 | `screens/inv2-serial-lot.md` |

**Navigation:** click **Inv. II** then **Serial/Lot No.**; hash must use `menuType=MENUTREE_000783`.

## Inv. II → Quality Control (left sub-menu)

Create/New QC Insp. Request · QC Request List/Status · Uninspected Status · New QC Insp. Type · New Quality Inspection · QC Inspection List/Status

See `screens/inv2-quality-control.md`.

## Inv. II → WMS (left sub-menu)

Select WMS Account · Warehouse Mgmt · Receipt Mgmt (Scheduled Receipt, Status, Process, New Increase) · Release Mgmt (Scheduled Release, Status, Process, New Decrease) · WMS Inventory Adjustment · WMS Inventory Balance · Inventory History Mgmt

See `screens/inv2-wms-export-order-plan.md`. Tenant has **no WMS license** — account selection gate only.

## Inv. II → Export / Order Mgmt / Plan Mgmt

Breadth catalog from Site Map + partial live crawl. See `screens/inv2-wms-export-order-plan.md`.

## Inv. I → Online Store Mgmt → Order Mgmt

See `screens/C000654-online-store-orders.md` — `E041005` Status · `E041006` Confirmation · `E041007` Delivery.  
Setup: `E041003` Register Online Store · `E041004` Item Code link — `screens/C000654-online-store.md`

## Acct. II horizontal tabs (module level) — **cataloged pass 1**

| L0 tab | Default prgId | Default screen | Screen doc |
|--------|---------------|----------------|------------|
| Receivable Management | C000125 | New Receivable Payment | `screens/acct2-breadth.md` |
| Billing Note | C001256 | Billing Note List | `screens/acct2-breadth.md` |
| Payable Management | C000126 | New Payable Payment | `screens/acct2-breadth.md` |
| Check Management | C000127 | Checks Received List | `screens/acct2-breadth.md` |
| Budget | C000021 | Budget Status | `screens/acct2-breadth.md` |
| Exps. / Expenses | C000005 | Trade Voucher List | `screens/acct2-breadth.md` |
| Contract | C000666 | Contract Field List | `screens/acct2-breadth.md` |
| e-Contract | C061101 | Contract Progress | `screens/acct2-breadth.md` |
| Withholding | C001258 | Withholding Tax on Sales List | `screens/acct2-breadth.md` |

## Mgmt / GW / Data Center — **cataloged pass 1**

| Module | Default prgId | Default screen | Screen doc |
|--------|---------------|----------------|------------|
| Mgmt | C000131 | Payroll Book | `screens/mgmt-gw-datacenter-breadth.md` |
| GW | C000007 | e-Approval (not licensed) | `screens/mgmt-gw-datacenter-breadth.md` |
| Data Center | C001401 | Register Collected Data | `screens/mgmt-gw-datacenter-breadth.md` |

## Acct. I → Fast Entry (left sub-menu)

General Journal · Payment Journal · Receipt Journal · S/A Journal · Bank Reconciliation · Auto Generate Voucher List · Balance Adjustment subtree

See `screens/acct1-fast-entry.md`.

## Acct. I horizontal tabs (module level) — **cataloged**

| L0 tab | Default prgId | Default screen | Screen doc |
|--------|---------------|----------------|------------|
| Setup | — | (not opened) | — |
| Fast Entry | — | (menu catalog only) | `screens/acct1-fast-entry.md` |
| Invoice | — | (not opened) | — |
| Bank Acct./Card | — | (not opened) | — |
| Cash | C000080 | Cash In/Out vouchers | `screens/E010404-cash-in-from-customer.md`, `screens/E010409-cash-out-to-vendor.md` |
| Non-Cash Transaction | — | (not opened) | — |
| Notes | — | (not opened) | — |
| Fixed Assets | — | (not opened) | — |
| Accounting Transaction Mgmt | — | (not opened) | — |
| Reports | C000001 | Reports hub | `screens/C000001-acct-reports-hub.md` |

## Acct. I → Reports hub (category summary)

Communication Center · **Management Resource** (cash, fund, aging, journal sums, N000121/N000128 summaries — `screens/acct1-reports-management-resource.md`) · **Book** (LedgerⅠ–Ⅲ `E010807`–`E010809`, Journal, Daily TB, **Cash Book `E010801`** — `screens/acct1-reports-book.md`; Sales/Purchase Book `N000122` empty in tenant) · **Financial Statements** (BS `E010813`, IS `E010812`, Cash Flows `E010861`, Retained Earnings `E010817`) · **Others** (Voucher Status, Print Voucher, Acct vs Inv, Change History Acct., Update Balance — `screens/acct1-reports-others.md`)

See `screens/C000001-acct-reports-hub.md` for full tree.

## Site Map inventory (Jul 2026)

Full Site Map overlay lists **832** navigable programs. **670** unique `prgId` → menu label mappings extracted live to [`site-map-prgids.csv`](site-map-prgids.csv) via `scripts/extract-sitemap-csv.py` (Jul 7 2026 crawl). **808** program names also in [`site-map-inventory.txt`](site-map-inventory.txt) (name-only, from earlier snapshot).

Merge `site-map-prgids.csv` into `coverage-matrix.csv` row-by-row as screens are depth-audited.

**Live crawl:** Re-login if session expires.

## Inv. I → Online Store Mgmt

Setup (store/item link) · Order Mgmt (status, confirm, delivery, cancel/return/exchange, ERP transmission)

See `screens/C000654-online-store.md`.

## Inv. I → Reports

Hub with Inventory Balance, Sales, Purchases, Production, Inv. Movement, and Others categories.

**Sales reports (pass 5–10):** Sales Status `E040207` · A/R by Customer `E040214` · Receipt Status `E040217` · Quotation Status `E040208` · Sales Order Status `E040209` · Receivable Status `E040721` · Outstanding Quote `E040211` · Outstanding S/O `E040212` · Shipment Status `E040227` · Pending Shipment `E040228` · Shipping Order Status `E040222` · Sales Discount `E040216` · Pre-Invoicing (Sales) `E040609` · Customer/Vendor Book I (AR) `E040723` · Sales Invoice Status (Inv.) `N000119` · Monthly Receivable Change `E040713` — see `screens/inv1-sales-reports.md`

**Purchase reports (pass 6–10):** Purchase Status `E040305` · A/P by Vendor `E040309` · PO Status `E040306` · Outstanding P/O `E040307` · Payment Status `E040310` · Payable Status `E040722` · Purchase Discount `E040313` · PR Status `E040318` · Plan Status `E041015` · Pre-Invoicing (Purchases) `E040319` · Customer/Vendor Book I (AP) `E040724` · Purchase Invoice Status (Inv.) `N000127` · Monthly Payable Fluctuation `E040714` — see `screens/inv1-purchase-reports.md`

**Communication / Proof (pass 14):** Message Log `E010851` · Sent Doc. History `E010858` · Proof Center `E040730` — see `screens/inv1-reports-communication-proof.md`

**Others reports (pass 10–13):** AR/AP Status `E040703` · Daily Profit Status `E040806` · Daily Costing Status `E040807` · Sales/Purchases Summary `E040725` · Summary `E040710` · Price Change History `E040819` · Management Report `E040704` · Status Grand Total `E040709` · View Transaction History `E040716` · Customer/Vendor Book I/II `E010833`/`E010842` · All-In-One I `E040627` · All-in-One II `E040633` — see `screens/inv1-reports-others.md`

**Inventory Balance reports (pass 11–12):** Inventory Balance `E040701` · Inv. Balance by Location `E040711` · Inv. Balance by Item Relation `E040728` · Inv. Book `E040702` · Inventory Change History `E040719` · Inventory Aging Details `E040727` · Inv. Balance by Multi Spec. `E040720` · Inv. balance converted by BOM `E040726` · Daily Report `E040708` — see `screens/inv1-reports-inventory-balance.md`

**Production reports (pass 12):** Job Order Status `E040413` · Progress Status by J/O `E040414` · Goods Issued Status `E040409` · Goods Receipt Status `E040410` — see `screens/inv1-reports-production.md`

**Inv. Movement reports (pass 12):** Location Tran. Status `E040505` · Internal Use Status `E040506` · Product Defect Status `E040509` — **No Authorization** in tenant; Inv. Count `E040615` · Inv. Adjustment `E040608` catalog only — see `screens/inv1-reports-inv-movement.md`

**Acct. I invoice status (pass 11):** Sales Invoice Status `N000118` · Purchase Invoice Status `N000126` — use `menuType=MENUTREE_000001`; documented in sales/purchase report docs

See `screens/C000035-reports-hub.md`.

## Cross-cutting pattern: list screens

Most transactional lists share:

- **Status pills:** All / e-Approval / Unconfirmed / Confirm
- **Toolbar:** New(F2), Email, Change Status, Send, Print, Barcode, e-Approval, Delete, Excel (+ View History on some)
- **F2 behavior:** Opens **list settings** submenu, not inline new document — use left-menu **New …** for `E04xxxx` form programs
- **Option panel:** At minimum a **Default** filter pill; additional pills configurable via List Tab Settings
