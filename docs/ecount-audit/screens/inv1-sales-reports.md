# Inv. I → Reports → Sales subtree (pass 5)

**Audit date:** Jul 7 2026 (pass 5–10)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Inv. I → Reports → Sales  
**Bluearm target:** `/app/selling/reports` (proposed)

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Rows (tenant) |
|--------|-------|---------|---------------|
| Sales Status | `E040207` | MENUTREE_000494 | ~406 line rows |
| A/R by Customer | `E040214` | MENUTREE_000500 | ~2,705 customer rows |
| Receipt Status | `E040217` | MENUTREE_001680 | 0 receipts (Jul 2026 MTD) |
| Quotation Status | `E040208` | MENUTREE_000495 | ~151 line rows |
| Sales Order Status | `E040209` | MENUTREE_000496 | ~57 line rows |
| Receivable Status | `E040721` | MENUTREE_001901 | 0 rows (Jul 2026 as-of) |
| Outstanding Quote Status | `E040211` | MENUTREE_000498 | populated backlog |
| Outstanding S/O Status | `E040212` | MENUTREE_000499 | ~69 open lines |
| Shipment Status | `E040227` | MENUTREE_000777 | 0 rows Jul MTD |
| Pending Shipment Status | `E040228` | MENUTREE_000779 | ~empty Jul 2026 as-of |
| Shipping Order Status | `E040222` | MENUTREE_000661 | 0 rows Jul MTD |
| Sales Discount Status | `E040216` | MENUTREE_000501 | 0 discounts Jul MTD |
| Pre-Invoicing Status (Sales) | `E040609` | MENUTREE_000502 | as-of Jul 2026 |
| Customer/Vendor Book I (AR) | `E040723` | MENUTREE_001903 | populated Jun–Jul 2026 |
| Sales Invoice Status (Inv.) | `N000119` | MENUTREE_003219 | 0 rows Jul MTD (Confirm filter) |
| Monthly Receivable Change Details | `E040713` | MENUTREE_001386 | Jul MTD range inquiry |

---

## Quotation Status (`E040208`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040208&menuSeq=MENUTREE_000495`

### L2 tab pills (Menu)

| Pill | Notes |
|------|-------|
| **Status** | Line-level quote inquiry (default) |
| **Summary** | Aggregated view |

### Type aggregation

by Line · Comparison Period (Do Not Use / Same Period Prev. Year–Day)

### Option panel sections

Date · **Reference No.** · Domestic/Foreign (All/Domestic/Foreign) · Location · Project · **Mgmt Field** · Customer · Item · Serial/Lot No. · Applied Template · Status · Sorting Criteria · View as Graph

### Result grid columns (Status)

Date-No. · Reference No. · Customer/Vendor Name · Item Name (Spec) · Qty · Non-Vat · Non-Vat Total · Remark

---

## Sales Order Status (`E040209`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040209&menuSeq=MENUTREE_000496`

### L2 tab pills (Menu)

| Pill | Notes |
|------|-------|
| **Status** | Line-level S/O inquiry (default) |
| **Summary** | Aggregated view |

### Type aggregation

by Line · Comparison Period (same set as Quotation)

### Option panel sections

Date · **Sales Order No.** · Currency (All/Domestic/Foreign) · **Delivery Date by Item** (date range) · Location-Out · Project · Customer · Item · Applied Template · Status · Sorting Criteria · View as Graph

### Result grid columns (Status)

Date-No. · Sales Order No. · Customer:Name · Item Name (Spec) · Qty · Price · Pretax Amount · Remark

---

## Receivable Status (`E040721`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040721&menuSeq=MENUTREE_001901`

Distinct from Acct. II `E060404` — this is **Inv. I → Reports → Sales** open-receivable line inquiry.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

**As-of Date** (single date, not range — shortcuts: Today, Last Day, etc.) · Customer (Include Sub-groups) · Customer Relation (Standard vs Individual) · PIC for Customer/Vendor · Include Deactivated Customer/Vendor · Template · Display Apvl. Line · Sort/Subtotal Criteria

### Toolbar

Search (F8) · date shortcuts incl. **Last Day** · Reset · Print · Excel

**Tenant note:** Jul 2026 as-of search returned **empty grid** (Print/Excel disabled). Differs from A/R by Customer (`E040214`) which uses a date **range** and shows roll-forward columns.

---

## Outstanding Quote Status (`E040211`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040211&menuSeq=MENUTREE_000498`

Open-quote backlog (not fulfilled / not converted). Distinct from **Quotation Status** (`E040208`) which is historical quote activity.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |

### Type aggregation

by Item · by Line (default)

### Option panel sections

**Date (Business Cycle)** — single as-of date · Reference No. · Location · Project · Mgmt Field · Customer · Item · PIC · PIC for Customer/Vendor · **Outstanding Quote Qty** (range) · Status · Sorting Criteria · View as Graph

### Result grid columns (by Line)

Date-No. · Reference No. · Customer/Vendor Name · Item Name (Spec) · Qty · **Outstanding Quote Qty** · Outstanding Quote Pretax Amount · Remark · Outstanding Quote Tax

**Tenant note:** Populated backlog (Jul 2026 as-of).

---

## Outstanding S/O Status (`E040212`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040212&menuSeq=MENUTREE_000499`

Mirror of Outstanding Quote for sales orders.

### Type aggregation

by Item · by Line (default)

### Option panel sections

Date (Business Cycle) · **Sales Order No.** · **Delivery Date by Item** (range) · Location-Out · Project · Customer · Item · PIC · PIC for Customer/Vendor · **Outstanding S/O Qty** (range) · Applied Template · Sorting Criteria · View as Graph

### Result grid columns (by Line)

Date-No. · Sales Order No. · Customer · Item Name (Spec) · Qty · **Outstanding S/O Qty** · Outstanding S/O Pretax Amount · **Delivery Date by Item** · Remarks · Outstanding S/O Tax

**Tenant note:** ~69 open S/O lines (Jul 2026 as-of).

---

## Shipment Status (`E040227`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040227&menuSeq=MENUTREE_000777`

### L2 tab pills (Menu)

| Pill | Notes |
|------|-------|
| **Status** | Line-level shipment inquiry (default radio group) |
| **Summary** | Aggregated view |

### Type aggregation

Details · Summary · by Line · Comparison Period (same set as Sales Status)

### Option panel sections

Date (range) · **Shipment No.** · Location · Project · Mgmt Field · Customer · Item · Status · Sorting Criteria · View as Graph

**Tenant note:** Jul 2026 MTD search returned **empty grid** (no shipment docs in period).

---

## Pending Shipment Status (`E040228`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040228&menuSeq=MENUTREE_000779`

Open-shipping backlog (not yet shipped). Third screen in the shipping trio: **Shipping Order Status** → **Shipment Status** → **Pending Shipment Status** (outstanding).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |

### Type aggregation

by Item · by Line (default)

### Option panel sections

**Date (Business Cycle)** — single as-of date · **Shipping Order No.** · **Scheduled Shipment Date** (range) · Location · Project · Mgmt Field · Customer · Item · PIC · **Pending Shipment Qty** (range) · Status · Sorting Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

**Tenant note:** Jul 2026 as-of returned **very few / empty rows** (no open pending shipments in period).

---

## Shipping Order Status (`E040222`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040222&menuSeq=MENUTREE_000661`

Historical shipping-order activity (mirror of Quotation/SO Status pattern for shipping orders).

### L2 tab pills (Menu)

| Pill | Notes |
|------|-------|
| **Status** | Line-level shipping-order inquiry (default) |
| **Summary** | Aggregated view |

### Type aggregation

Details · Summary · by Line · Comparison Period (same set as Sales Status)

### Option panel sections

Date (range) · **Shipping Order No.** · **Scheduled Shipment Date** (range) · Location · Project · Mgmt Field · Customer · Item · Status · Sorting Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

**Tenant note:** Jul 2026 MTD search returned **empty grid** (Print/Excel disabled when empty).

---

## Sales Discount Status (`E040216`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040216&menuSeq=MENUTREE_000501`

Mirror of **Receipt Status** for sales discount vouchers (not line-level sales).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Date (range, This Month default) · Transaction Type · Location-Out (Include Sub-groups) · Customer (Include Sub-groups) · Project · PIC for Customer/Vendor · **Discount Amount** (range) · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts incl. **End Date** · Reset · Print · Excel

**Tenant note:** Jul 2026 MTD **empty** (Print/Excel disabled).

---

## Pre-Invoicing Status (Sales) (`E040609`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040609&menuSeq=MENUTREE_000502`

Open pre-invoice / uninvoiced sales backlog as-of a business-cycle date.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

**Base Date (Business Cycle)** — single as-of date (not range) · Transaction Type · Location-Out (Include Sub-groups) · Project · Customer (Include Sub-groups) · Item (category sub-filters) · PIC for Customer/Vendor · **Amount** (range) · Template · Display Apvl. Line · Sort/Subtotal Criteria

### Toolbar

Search (F8) · date shortcuts incl. End Date · Reset · Print · Excel

---

## Customer/Vendor Book I (AR) (`E040723`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040723&menuSeq=MENUTREE_001903`

AR **sub-ledger statement** (slip-level transaction history). Distinct from **A/R by Customer** (`E040214`) roll-forward summary.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Reports |

### Summary Type (L2 radios)

by Slip · **By Slip + Details** (default) · Daily · Monthly · By account voucher

### Option panel sections

Date (range, default Prev. Month + Current Month) · Customer (Include Sub-groups) · Customer Relation (Standard vs Individual) · **Print Data without Customer/Vendor Code** · Template · Display Apvl. Line · Sort/Subtotal Criteria

### Toolbar

Search (F8) · date shortcuts · Reset · Print · **Email** · Excel

**Tenant note:** Jun–Jul 2026 range returns populated AR statement rows.

---

## Sales Invoice Status (Inv.) (`N000119`)

**URL hash:** `menuType=MENUTREE_000004&prgId=N000119&menuSeq=MENUTREE_003219`

Tax/accounting **sales invoice slip** inquiry (distinct from inventory Sales List collective invoicing). Uses **N-prefixed** prgId under Inv. I Reports → Sales.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Status filter (L2 radios)

All · e-Approval · Unconfirmed · **Confirm** (default)

### Option panel sections

Date (range; default Recent 30 Days Jun–Jul 2026) · **Accounting Slip No.** · Dept. (Include Sub-groups) · Project · Customer (Include Sub-groups) · PIC for Customer/Vendor · **Tax Entity** (checkbox) · **Tax Type** · Status (above) · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts incl. **Prev. Qtr** · Reset · Print · Excel

**Tenant note:** Jul 2026 MTD search with default **Confirm** status returned **empty grid** (Print/Excel disabled). Related: **`N000118` Sales Invoice Status** (Acct. I — pass 11) · `N000120` Sales Invoice Status (Contract).

---

## Sales Invoice Status (`N000118`) — Acct. I

**URL hash:** `menuType=MENUTREE_000001&prgId=N000118&menuSeq=MENUTREE_003218`

Non-Inv. tax/accounting sales invoice inquiry under **Acct. I → Reports → Others**. Filter shape matches `N000119` (Tax Entity + Status Confirm pills + Accounting Slip No.). **Quirk:** `menuType=MENUTREE_000004` with this `menuSeq` opens **Sales List** instead.

---

## Monthly Receivable Change Details (`E040713`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040713&menuSeq=MENUTREE_001386`

Month-over-month **AR fluctuation** detail (customer-level change lines). Mirror purchase side: **Monthly Payable Fluctuation** (`E040714`).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Date (range; default **This Month (~ Today)** Jul 2026) · Customer (Include Sub-groups) · Customer Relation (**Customer Relation Standard** vs Based on Individual Customer) · PIC for Customer/Vendor · Include Deactivated Customer/Vendor (default checked) · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings

### Toolbar

Search (F8) · date shortcuts (Today, Prev. Day, This Week, Prev. Week, This Month, Prev. Month, **End Date**) · Reset · Print · Excel

**Tenant note:** Jul 2026 MTD search; Print/Excel enabled after search (structural output even if sparse).

---

## Sales Status (`E040207`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040207&menuSeq=MENUTREE_000494`

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Active template |
| *(unnamed)* | Second template slot (tenant has one applied) |

### Type aggregation (L2 radios)

| Value | Label |
|-------|-------|
| 0 | **Details** (default) |
| 1 | Summary |
| 2 | by Line |
| 3–4 | Comparison period modes: Same Period of Prev. Year / Month / Week / Day |
| — | **Do Not Use** (comparison off) |

### Option panel sections

Date (manual + quick ranges) · Transaction Type · Currency (All / Domestic / Foreign) · Location-Out · Project · Customer · Item · Serial/Lot No. · Category (All / General / Returns) · Applied Template · Status · Sorting Criteria · View as Graph

### Result grid columns (Details)

Date-No. · Receivable No. · Customer:Name · Item Name (Spec) · Qty · Non-Vat · Non-Vat Total · Tax · Total

### Toolbar

Search (F8) · date shortcuts (Today, Prev. Day, This Week, Prev. Week, This Month, Prev. Month) · Reset · Print · Excel

---

## A/R by Customer (`E040214`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040214&menuSeq=MENUTREE_000500`

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (L2 radios)

| Value | Label |
|-------|-------|
| 1 | **By Customer/Vendor** (default) |
| 2 | by PIC |

### Option panel sections

Date (incl. End Date shortcut) · Customer (Include Sub-groups) · Customer Relation (Standard vs Individual Customer) · PIC for Customer/Vendor · Include Deactivated Customer/Vendor · Balance (Receivable) Includes 0 · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Result grid columns

Customer/Vendor Name · Beginning Receivables · Inv. Sales · Acct. Sales · Total Receipt · Difference · Balance

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Receipt Status (`E040217`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040217&menuSeq=MENUTREE_001680`

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Date (This Month default) · Customer (Include Sub-groups) · Dept. (Include Sub-groups) · Project · PIC for Customer/Vendor · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Result grid columns

Date-No. · Customer/Vendor Name · Amount · Remark (duplicated column groups for subtotal layout)

### Toolbar

Search (F8) · date shortcuts incl. **Current Period** · Reset · Print · Excel

**Tenant note:** Jul 2026 MTD search returned empty grid (no cash receipts in period); Print/Excel disabled when empty.

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Sales Status line-level inquiry with comparison periods | Sales analytics / margin reports partial |
| A/R by Customer with Inv. vs Acct. sales split | AR aging by customer only |
| Receipt Status with dept/PIC dimensions | Receipt voucher list without sub-ledger dimensions |
| Category General vs Returns on Sales Status | Return sales not split in reports |
| Quotation Reference No. + Mgmt Field filters | No quote status report |
| Sales Order Delivery Date by Item filter | SO fulfillment date filtering partial |
| Receivable Status as-of (vs A/R range roll-forward) | AR aging uses period range only |
| Pending Shipment as-of + Scheduled Shipment Date | No open-shipment backlog report |
| Shipping Order Status line inquiry | Shipping module reports partial |
| Sales Discount inquiry | No discount voucher report |
| Pre-Invoicing as-of backlog | No uninvoiced sales report |
| Customer/Vendor Book AR statement | AR sub-ledger statement partial |
| Sales Invoice Status (Inv.) with Tax Entity + doc-status pills | No tax-invoice status report |
| Monthly Receivable Change Details | No AR fluctuation report |

## Tab pill checklist

- [x] E040207 — Default pill + Type Details/Summary/by Line + comparison radios
- [x] E040207 — Option filters + grid columns
- [x] E040214 — Default pill + Type By Customer/Vendor vs by PIC
- [x] E040214 — Customer relation radios + grid columns
- [x] E040217 — Default pill + Option filters + grid columns
- [x] E040208 — Menu Status/Summary + Reference No. + grid columns (pass 6)
- [x] E040209 — Menu Status/Summary + Delivery Date + SO grid (pass 6)
- [x] E040721 — Default pill + as-of date filters (pass 6; tenant empty)
- [x] E040211 — Default + Type by Item/by Line + Outstanding Quote Qty (pass 7)
- [x] E040212 — Default + SO No. + Delivery Date + outstanding grid (pass 7)
- [x] E040227 — Default + Details/Summary/by Line + Shipment No. (pass 7; tenant empty Jul MTD)
- [x] E040228 — Default + Type by Item/by Line + Pending Shipment Qty (pass 8; tenant empty as-of)
- [x] E040222 — Menu Status/Summary + Details/by Line + Shipping Order No. (pass 8; tenant empty Jul MTD)
- [x] E040216 — Default + Discount Amount range (pass 9; tenant empty Jul MTD)
- [x] E040609 — Default + Base Date as-of + Amount filter (pass 9)
- [x] E040723 — Default + Summary Type By Slip+Details + Email (pass 9)
- [x] N000119 — Default + Status Confirm/e-Approval + Tax Entity + Accounting Slip No. (pass 10; tenant empty Jul MTD)
- [x] E040713 — Default + Customer relation radios + month range (pass 10)
- [x] N000118 — Acct. I hash + mirror N000119 filters (pass 11; catalog cross-ref)
