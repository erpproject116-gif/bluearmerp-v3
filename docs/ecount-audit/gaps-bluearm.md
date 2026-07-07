# Bluearm parity backlog (from ECount audit)

Prioritized gaps discovered during ECount reference review. Update as audit progresses.

## P0 — Navigation / IA (implemented or in flight)

| Gap | ECount behavior | Bluearm fix | Status |
|-----|-----------------|-------------|--------|
| Supplier invoices showed full Accounts header | Purchases/review under Inv. I **Purchases** tab (C000031), not Acct. I | `ReviewPurchasesHeaderNav` + `resolveModule` override | **Done** |
| Sidebar label | Purchases review area | Renamed to **Review Purchases** in Buying group | **Done** |
| List status filter pills | Purchase List: All / e-Approval / Unconfirmed / Confirm | Payment status filter done; doc-status pills + list template tabs 1–6 pending |

## Tab pill parity (cross-cutting)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Form split across 7 pills | Item New form: Default/Qty/Price/Cost/Additional/Management | Item modal — use tab panels not one long form |
| Option filter pills mirror form | Same 7 sections in search Option | Advanced search drawer with sections |
| Module L0 tabs switch menu tree | Setup vs Purchases vs Sales | Already similar; ensure each tab's programs cataloged |
| Safety stock per document type | Qty pill — 7 doc types | Extend reorder / safety stock model |
| Serial/Lot policy radios | Management pill | `track_serial` + optional/required policy |

## P1 — Item master (C000029)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Advanced item search | 7-section Option filter with 50+ fields | Extend item list filters + saved views |
| Multi price levels | VIP + Price B–J + O/E | Price lists + default prices on item |
| Item categories | 6 manufacturing/merchandise categories | Item type / category enum |
| Bundle & service items | Naming + bundle status column | Product bundles module |
| Barcode from list toolbar | Barcode button | Item barcode + POS scan |
| Inv. adjustment from list | Inv. Adj. → Inv. Count I per-location grid | Stock entries shortcut — **Adjust flow crawled pass 7** |
| Excel on list | Excel import/export | Data Center or item import |
| Serial/lot on item | Management tab + filter | Serial/lot settings on item |

## P1 — Buying / Review Purchases

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Purchase review header | Purchases tab under Inv. I | Review Purchases nav (done) |
| GR → invoice → payment chain | Integrated under Purchases | PO → GR → supplier invoice → PV |

## P1 — Sales (E040205 / C000030)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Sales list status pills | All / e-Approval / Unconfirmed / Confirm | **Done** — list filter + submit/approve/reject (migration 128) |
| New Sales Hold | Line-level stock hold | Reservation/hold model |
| SO pull on invoice | Sales Order toolbar | SO → sales line picker |
| Cash In on save | Inline receipt modal (Cash In - From Customer) | Receipt vouchers |
| Link with Accounting Vouchers | E010301 accounting block + confirm dialog | GL posting panel on sales save |
| Create Shipping Order from line | Shipping integration | Shipping module |

## P1 — Serial/Lot (Inv. II — pass 17)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Slip type pills All + 1–10 | Filter by doc origin type on C000092 | Serial history filters by source doc |
| Linked Slip vs Set Manually | Option filter on slip list | Distinguish slip-linked vs manual serial rows |
| Serial/Lot Status report | E040639 — Details/Summary, Terms of Validity, Slip Type | Serial movement inquiry UI |
| Serial Inv. Book / Balance | E040620 / E040619 — General/Summary; By Location type | Extend serial unit APIs + ledger views |
| Item vs. Serial/Lot Balance | E041018 — Compare by Serial/Lot No. or Item | Item qty vs serial-unit count report |
| Inventory Adj. by Serial/Lot | C000691 / E040634 — same adj workspace | Stock adjustment per serial unit |
| Reg. Serial/Lot No. | C000690 — New (F2) form; 21 slip types | Manual serial registration form |

## P2 — Quality Control (C000093 / Inv. II)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| QC request list | 5 status pills: All / e-Approval / Confirm / In Progress / Completed | Future `/app/qms` module |
| QC from purchase/GR | Create Quality Insp. Request on line | Wire from supplier invoice / GR |
| QC inspection list | 4 pills: All / In Progress / Completed / History + Pass/Fail filters | Future `/app/qms` |
| Uninspected Status | Report of pending items | QMS dashboard |

## P2 — Accounting journals (E010201 / Acct. I Fast Entry)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| General Journal form | Dr/Cr grid + party sub-ledger + Load Slip | `/app/finance/journal` voucher entry |
| 4-way journal split | General / Payment / Receipt / S/A separate forms | **All 4 crawled** — S/A uses Employee sub-ledger; see E010505 |
| Auto Generate Voucher List | E010213 — single All pill list | GL auto-post from slips — see E010213 |
| Bank Reconciliation | E010208 — list + match modal | `/app/finance/acct-i/bank-reconciliation` partial |
| Balance adjustment subtree | New/adjustment/count lists | Period close workflow — **E010209–212 pass 3** (sub-ledger Bal. Count + E010210 F2) |

## P1 — Sales reports (Inv. I → Reports → Sales)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Sales Status line inquiry | Details/Summary/by Line + comparison periods | `/app/selling/reports` — **crawled pass 5** |
| A/R by Customer | Inv. vs Acct. sales + receipt roll-forward | AR aging by customer — extend with sales source split |
| Receipt Status | Dept/PIC dimensional receipt inquiry | Receipt voucher list — add dimensions |
| Quotation Status | Status/Summary + Reference No. + Mgmt Field | Quote analytics — **crawled pass 6** |
| Sales Order Status | Delivery Date by Item + SO No. filter | SO fulfillment reporting — **crawled pass 6** |
| Receivable Status | As-of open receivable (Inv. I `E040721`) | AR aging uses period range only — **crawled pass 6** |
| Outstanding Quote/S/O backlog | As-of + outstanding qty filters | Open quote/SO reports — **crawled pass 7** |
| Shipment Status | Status/Summary + line inquiry | Shipping module reports partial — **crawled pass 7** |
| Pending Shipment + Shipping Order Status | As-of backlog + SO line inquiry | Shipping trio — **crawled pass 8** |
| Sales Discount + Pre-Invoicing (Sales) | Discount voucher + uninvoiced backlog | **crawled pass 9** |
| Customer/Vendor Book I (AR) | Sub-ledger statement + Email | AR statement report — **crawled pass 9** |
| Sales Invoice Status (Inv.) + Monthly Receivable Change | Tax slip inquiry + AR fluctuation | **crawled pass 10** |

## P1 — Purchase reports (Inv. I → Reports → Purchases)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Purchase Status | Date/Summary/by Line mirror of sales | `/app/buying/reports` — **crawled pass 6** |
| A/P by Vendor | Inv. vs Acct. purchase + payment roll-forward | AP aging by vendor — extend with purchase source split |
| Purchase Order Status | PO line inquiry mirror of SO | `/app/buying/reports` — **crawled pass 7** |
| Outstanding P/O + Payment Status | Open PO backlog + payment inquiry | PO fulfillment + PV list dimensions — **crawled pass 7** |
| Payable Status | As-of open payable (`E040722`) mirror of Receivable | AP aging uses period range only — **crawled pass 8** |
| Purchase Discount + Pre-Invoicing + PR/Plan Status | Buying analytics subtree | **crawled pass 9** |
| Customer/Vendor Book I (AP) | AP sub-ledger statement | **crawled pass 9** |
| Purchase Invoice Status (Inv.) + Monthly Payable Fluctuation | Tax slip + AP fluctuation | **crawled pass 10** |

## P1 — Others reports (Inv. I → Reports → Others)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| AR/AP combined as-of | Type Receivable/Payables/Combined toggle | Single AR+AP position screen — **crawled pass 10** |
| Daily Profit with FIFO vs monthly cost | Margin analytics — **crawled pass 10** |
| Daily Costing as-of with Last Purchase Price | Cost-only daily inquiry — **crawled pass 11** |
| Sales/Purchases Summary | User-defined Summary Condition 1/2/Target | Cross-module analytics — **crawled pass 13** |
| Summary (six menu types) | Sales/PO/SO/GR combined summary | Flexible summary report — **crawled pass 13** |
| Price Change History | by Slip + avg/max/min price | Price audit — **crawled pass 13** |
| Management Report | Template-driven KPI | Custom management dashboard — **crawled pass 13** |
| Status Grand Total | Vertical/Horizontal status matrix | Executive rollup — **crawled pass 13** |
| View Transaction History | Slip/Basic Code change audit | Document audit trail — **crawled pass 13** |
| Customer/Vendor Book I/II generic | Combined AR/AP statement books | Extend AR/AP statements — **crawled pass 13** |
| All-In-One I / II workspaces | Customer/item cockpit with quick links | CRM-style workspace — **crawled pass 13** |

## P2 — Communication & Proof (Inv. I → Reports)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Message Log (Msg. inbox) | All/Unconfirmed/Confirm/SB/Sent Msg + AI Summary | No internal messaging — **crawled pass 14** |
| Sent Doc. History | Email/SMS send log + Resend | Partial email tracking — **crawled pass 14** |
| Proof Center | Attach Receipts + e-Sign voucher proofs | No proof attachment hub — **crawled pass 14** |

## P1 — Inventory Balance reports (Inv. I → Reports → Inventory Balance)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Inventory Balance as-of + safety stock | On-hand qty + below-safety filter | Stock on hand — **crawled pass 11** |
| Balance by Location matrix | Horizontal/Vertical location pivot | Location qty columns — **crawled pass 11** |
| Inv. Book stock ledger | Opening/issue/closing + price columns | Stock ledger — **crawled pass 11** |
| Inventory Change History pivot | Summary/Daily/Monthly category columns | Movement summary — **crawled pass 11** |
| Inventory Aging Details | Bucket aging by item | Aging report — **crawled pass 11** |
| Multi-spec balance | Spec. Group/Code 1–3 pivot | No spec-dimension stock — **crawled pass 12** |
| BOM-converted balance | Parent item → component qty | No BOM explosion report — **crawled pass 12** |
| Daily Report (cross-module) | Customer relation type + dept/project | No daily ops dashboard — **crawled pass 12** |

## P1 — Production reports (Inv. I → Reports → Production/Outsourcing)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Job Order Status | Details/Summary/by Line + delivery date | Job order analytics — **crawled pass 12** |
| Progress Status by J/O | Four progress KPI types | Production progress dashboard — **crawled pass 12** |
| Goods Issued/Receipt Status | Dimensional GI/GR inquiry + GR type filters | GI/GR list only — **crawled pass 12** |

## P1 — Inv. Movement reports (Inv. I → Reports → Inv. Movement)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Location Tran. / Internal Use / Product Defect Status | Standard status report pattern | **No Authorization** in tenant — catalog only pass 12 |
| Inv. Count / Adjustment Status | Count/adj document inquiry | Auth blocked — see `inv1-reports-inv-movement.md` |

## P1 — Acct. I invoice status (non-Inv. variants)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Sales/Purchase Invoice Status (`N000118`/`N000126`) | Acct. I Others; same as Inv. variants minus menu path | Tax slip status under Acct. I — **crawled pass 11** |

## P2 — Acct. I Others (pass 16)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Voucher status inquiry | E010847 (title Voucher Status) | GL voucher analytics — **crawled pass 16** |
| Batch voucher print | E010702 Print Voucher | Voucher print queue — **crawled pass 16** |
| Acct vs Inv reconciliation | E010730 | Accounting vs inventory — **crawled pass 16** |
| Acct. change history | E010712 Change History (Acct.) | Voucher audit — **crawled pass 16** |
| GL balance rebuild | E010705 Update Balance | Period close job — **crawled pass 16** |
| All-In-One (Acct. path) | E040627 menuSeq 001352 | Partner cockpit — **crawled pass 16** |

## P2 — Management Resource (Acct. I → Reports)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Cash / fund reports | Cash Report · Fund Statement · Fund In./De. Details | Cash management — **crawled pass 15** |
| Cash flow comparison | Cash Flow (Deposit and Withdrawal Details) | Period-over-period cash detail — **crawled pass 15** |
| Monthly P&L / cost | Monthly Income Statement · Monthly Cost | Period column analytics — **crawled pass 15** |
| AR/AP aging | AR/AP Aging · AR/AP Aging Details | Aging summary + detail buckets — **crawled pass 15** |
| Journal rollups | Payments/Receipts/S-A Journal Sum. | Cash journal aggregation — **crawled pass 15** |
| Acct. sales/purchase summary | Sales Summary `N000121` · Purchase Summary `N000128` | Cross-module rollup — **crawled pass 15** |
| Management charts | Management Report `E010821` | BI chart templates — **crawled pass 15** |
| Accounting Summary | Summary Condition 1–3 pivot | Multi-dimension account summary — **crawled pass 15** |

## P2 — Still to audit

- Online Store Cancel/Return/Exchange/ERP Transmission — **done pass 2** (`C000654-online-store-orders.md`)
- Depth-audit: **New Sales Order** `E040203`, **New PO** `E040301`, **Cash In** `E010404`, **Cash Out** `E010409` — pass 1 done
- Acct. I Reports Book: LedgerⅠ–Ⅲ + BS/IS + **Statement of Cash Flows** + Retained Earnings + **Cash Book** — pass 5 done (`acct1-reports-book.md`)
- Inv. I Sales reports: Sales Status / A/R by Customer / Receipt Status — **pass 5 done** (`inv1-sales-reports.md`)
- Inv. I Sales reports (pass 6): Quotation Status `E040208` · Sales Order Status `E040209` · Receivable Status `E040721` — see `inv1-sales-reports.md`
- Inv. I Purchase reports (pass 6): Purchase Status `E040305` · A/P by Vendor `E040309` — see `inv1-purchase-reports.md`
- Inv. I Sales reports (pass 7): Outstanding Quote `E040211` · Outstanding S/O `E040212` · Shipment Status `E040227` — see `inv1-sales-reports.md`
- Inv. I Purchase reports (pass 7): PO Status `E040306` · Outstanding P/O `E040307` · Payment Status `E040310` — see `inv1-purchase-reports.md`
- Inv. I Sales reports (pass 8): Pending Shipment `E040228` · Shipping Order Status `E040222` — see `inv1-sales-reports.md`
- Inv. I Purchase reports (pass 8): Payable Status `E040722` — see `inv1-purchase-reports.md`
- Inv. I Sales reports (pass 9): Sales Discount `E040216` · Pre-Invoicing (Sales) `E040609` · Customer/Vendor Book I (AR) `E040723` — see `inv1-sales-reports.md`
- Inv. I Purchase reports (pass 9): Purchase Discount `E040313` · PR Status `E040318` · Plan Status `E041015` · Pre-Invoicing (Purchases) `E040319` · Customer/Vendor Book I (AP) `E040724` — see `inv1-purchase-reports.md`
- Inv. I Sales reports (pass 10): Sales Invoice Status (Inv.) `N000119` · Monthly Receivable Change `E040713` — see `inv1-sales-reports.md`
- Inv. I Purchase reports (pass 10): Purchase Invoice Status (Inv.) `N000127` · Monthly Payable Fluctuation `E040714` — see `inv1-purchase-reports.md`
- Inv. I Communication/Proof reports (pass 14): Message Log `E010851` · Sent Doc. History `E010858` · Proof Center `E040730` — see `inv1-reports-communication-proof.md`
- Acct. I Management Resource reports (pass 15): Cash Report `E010830` · Cash Flow `E010805` · Fund Statement `E010804` · Fund In./De. Details `E010815` · Monthly IS `E010819` · Monthly Cost `E010824` · AR/AP Aging `E010822`/`E010823` · Management Report `E010821` · Accounting Summary `E010843` · Sales/Purchase Summary `N000121`/`N000128` · Journal Sums `E010835`/`E010836`/`E010840` — see `acct1-reports-management-resource.md`
- Acct. I Others reports (pass 16): Voucher Status `E010847` · Print Voucher `E010702` · Accounting vs. Inventory `E010730` · Change History (Acct.) `E010712` · Update Balance `E010705` · All-In-One I Acct path `E040627` · N000118/N000126 cross-ref pass 11 — see `acct1-reports-others.md`
- Inv. I Others reports (pass 10–13): AR/AP Status `E040703` · Daily Profit `E040806` · Daily Costing `E040807` · Sales/Purchases Summary `E040725` · Summary `E040710` · Price Change History `E040819` · Management Report `E040704` · Status Grand Total `E040709` · View Transaction History `E040716` · Customer/Vendor Book I/II `E010833`/`E010842` · All-In-One I/II `E040627`/`E040633` — see `inv1-reports-others.md`
- Inv. I Inventory Balance reports (pass 11–12): `E040701` · `E040711` · `E040728` · `E040702` · `E040719` · `E040727` · `E040720` · `E040726` · `E040708` · Daily Costing `E040807` — see `inv1-reports-inventory-balance.md` and `inv1-reports-others.md`
- Inv. I Production reports (pass 12): `E040413` · `E040414` · `E040409` · `E040410` — see `inv1-reports-production.md`
- Inv. I Inv. Movement reports (pass 12): `E040505` · `E040506` · `E040509` — **No Authorization**; `E040615` · `E040608` catalog only — see `inv1-reports-inv-movement.md`
- Acct. I invoice status (pass 11): Sales Invoice Status `N000118` · Purchase Invoice Status `N000126` — require `menuType=MENUTREE_000001`
- New Purchases `E040303` Load Slip slip-type modal — **pass 5 done**; PO line-picker — **pass 8 done**
- Online Store setup `E041003`/`E041004` — pass 2 done (`C000654-online-store.md`); E041004 blocked until store registered
- Cash Flow **Enter** line grid + Apply Formula — pass 4 done
- Ledger IV `E010856` · Sales/Purchase Book `N000122` — empty render in tenant (verify license)
- Mgmt HR / Time Mgmt · GW CRM (e-Approval not licensed)

## Mapping convention

When logging in `coverage-matrix.csv`:

- `bluearm_route` — existing or proposed path
- `gap_priority` — P0–P3
- `notes` — link to `screens/{prgId}.md`
