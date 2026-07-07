# Inv. I → Reports → Purchases subtree (pass 6)

**Audit date:** Jul 7 2026 (pass 6–10)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Inv. I → Reports → Purchases  
**Bluearm target:** `/app/finance/reports` or `/app/buying/reports` (proposed)

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Rows (tenant) |
|--------|-------|---------|---------------|
| Purchase Status | `E040305` | MENUTREE_000513 | ~270 line rows |
| A/P by Vendor | `E040309` | MENUTREE_000517 | ~112 vendor rows |
| Purchase Order Status | `E040306` | MENUTREE_000515 | populated Jul MTD |
| Outstanding P/O Status | `E040307` | MENUTREE_000516 | open PO backlog |
| Payment Status | `E040310` | MENUTREE_001682 | 0 payments Jul MTD |
| Payable Status | `E040722` | MENUTREE_001902 | 0 rows (Jul 2026 as-of) |
| Purchase Discount Status | `E040313` | MENUTREE_000518 | 0 discounts Jul MTD |
| Purchase Request Status | `E040318` | MENUTREE_000514 | Jul MTD inquiry |
| Purchase Plan Status | `E041015` | MENUTREE_002764 | Jul MTD inquiry |
| Pre-Invoicing Status (Purchases) | `E040319` | MENUTREE_000703 | as-of Jul 2026 |
| Customer/Vendor Book I (AP) | `E040724` | MENUTREE_001904 | populated Jun–Jul 2026 |
| Purchase Invoice Status (Inv.) | `N000127` | MENUTREE_003231 | 0 rows Jul MTD (Confirm filter) |
| Monthly Payable Fluctuation | `E040714` | MENUTREE_001387 | Jul MTD range inquiry |

---

## Purchase Status (`E040305`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040305&menuSeq=MENUTREE_000513`

Mirror of **Sales Status** (`E040207`) for purchase invoices.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Active template |

### Type aggregation (L2 radios)

| Value | Label |
|-------|-------|
| 0 | **Date** (line detail by date — default) |
| 1 | Summary |
| 2 | by Line |
| 3–4 | Comparison period modes |

### Option panel sections

Date · Transaction Type · Domestic/Foreign (All/Domestic/Foreign) · **Location** (not Location-Out) · Project · Customer (vendor) · Item · Serial/Lot No. · Applied Template · Status · Sorting Criteria · View as Graph

### Result grid columns (Date type)

Date-No. · Payable No. · Customer/Vendor Name · Item Name (Spec) · Serial/Lot No. · QTY · Price · Pretax Amount · Tax · Total

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## A/P by Vendor (`E040309`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040309&menuSeq=MENUTREE_000517`

Mirror of **A/R by Customer** (`E040214`) for payables.

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

Date (range, default Prev. Month + Current Month) · Customer/vendor (Include Sub-groups) · Customer Relation (Standard vs Individual) · PIC for Customer/Vendor · Include Deactivated Customer/Vendor · **Balance(Payables) Includes 0** · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Result grid columns

Customer/Vendor Name · Beginning Payables · Inv. Purchases · Acct. Purchases · Payment Total · Difference · Balance

### Toolbar

Search (F8) · date shortcuts incl. **End Date** · Reset · Print · Excel

**Note:** Site map lists this under Inv. I Reports → Purchases; hash navigation may also surface Production/OE left-menu context in tenant.

---

## Purchase Order Status (`E040306`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040306&menuSeq=MENUTREE_000515`

Mirror of **Sales Order Status** (`E040209`) for purchase orders.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation

Details · Summary · by Line · Comparison Period

### Option panel sections

Date (range) · **PO No.** · Domestic/Foreign (All/Domestic/Foreign) · **Delivery Date by Item** (range) · Location · Project · Vendor (Include Sub-groups) · Item (category + status sub-filters) · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts incl. **Current Year** · Reset · Print · Excel · Email

---

## Outstanding P/O Status (`E040307`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040307&menuSeq=MENUTREE_000516`

Mirror of **Outstanding S/O Status** (`E040212`) for purchase orders.

### Type aggregation

by Item · by Line (default)

### Option panel sections

Date (Business Cycle) — as-of · PO No. · Delivery Date (range) · Location · Project · Vendor · Item · PIC · PIC for Customer/Vendor · **Outstanding P/O Qty** (range) · Applied Template · Sorting Criteria · View as Graph

---

## Payment Status (`E040310`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040310&menuSeq=MENUTREE_001682`

Mirror of **Receipt Status** (`E040217`) for vendor payments.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Date (range) · Customer/vendor (Include Sub-groups) · **Dept.** (Include Sub-groups) · Project · PIC for Customer/Vendor · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Result grid columns

Date-No. · Customer/Vendor Name · Amount · Remark (mirrors receipt layout)

**Tenant note:** Jul 2026 MTD empty (Print/Excel disabled). **Note:** `E040310` also appears under Production/OE menu tree — use Reports → Purchases hash above for Inv. I parity.

---

## Payable Status (`E040722`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040722&menuSeq=MENUTREE_001902`

Mirror of **Receivable Status** (`E040721`) for vendor payables — open-payable line inquiry (as-of, not roll-forward).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

**As-of Date** (single date, not range) · Customer/vendor (Include Sub-groups) · Customer Relation (Standard vs Individual) · PIC for Customer/Vendor · Include Deactivated Customer/Vendor · Template · Display Apvl. Line · Sort/Subtotal Criteria

### Toolbar

Search (F8) · date shortcuts incl. **Last Day** · Reset · Print · Excel

**Tenant note:** Jul 2026 as-of returned **empty grid** (Print/Excel disabled). Differs from A/P by Vendor (`E040309`) which uses a date **range** and shows roll-forward columns.

---

## Purchase Discount Status (`E040313`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040313&menuSeq=MENUTREE_000518`

Mirror of **Sales Discount Status** (`E040216`) for purchase discounts.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Date (range) · Transaction Type · **Location** (Include Sub-groups) · Customer/vendor (Include Sub-groups) · Project · PIC for Customer/Vendor · **Discount Amount** (range) · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts incl. **Prev. Period** · Reset · Print · Excel

**Tenant note:** Jul 2026 MTD **empty**.

---

## Purchase Request Status (`E040318`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040318&menuSeq=MENUTREE_000514`

Mirror of **Sales Order Status** / **Quotation Status** pattern for purchase requests.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |

### Type aggregation

Details · Summary · by Line · Comparison Period

### Option panel sections

Date (range) · **Purchase Request No.** · Domestic/Foreign (All/Domestic/Foreign) · **Delivery Date** (range) · Location · Project · Mgmt Field · Customer/vendor · Item · Status (for printing) · Sorting Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts incl. End Date · Reset · Print · Excel

---

## Purchase Plan Status (`E041015`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E041015&menuSeq=MENUTREE_002764`

**Note:** Site map prgId is `E041015` (not `E040317` list form).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |

### Type aggregation

Details · Summary · by Line

### Option panel sections

Date (range) · **Delivery Date** (range) · Domestic/Foreign · Location (Include Sub-groups) · Project · Customer/vendor (Include Sub-groups) · Item (category + In Progress/Completed status sub-filters) · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts incl. End Date · Reset · Print · Excel

---

## Pre-Invoicing Status (Purchases) (`E040319`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040319&menuSeq=MENUTREE_000703`

Mirror of **Pre-Invoicing Status (Sales)** (`E040609`) for vendor AP backlog.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

**Base Date (Business Cycle)** — single as-of date · Transaction Type · **Location** (Include Sub-groups) · Project · Customer/vendor (Include Sub-groups) · Item (category sub-filters) · PIC for Customer/Vendor · **Amount** (range) · Template · Display Apvl. Line · Sort/Subtotal Criteria

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Customer/Vendor Book I (AP) (`E040724`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040724&menuSeq=MENUTREE_001904`

Mirror of **Customer/Vendor Book I (AR)** (`E040723`) for vendor AP sub-ledger statements.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Reports |

### Summary Type

by Slip · **By Slip + Details** (default) · Daily · Monthly · By account voucher

### Option panel sections

Date (range) · Customer/vendor (Include Sub-groups) · Customer Relation (Standard vs Individual) · Print Data without Customer/Vendor Code · Template · Display Apvl. Line · Sort/Subtotal Criteria

### Toolbar

Search (F8) · date shortcuts · Reset · Print · **Email** · Excel

---

## Purchase Invoice Status (Inv.) (`N000127`)

**URL hash:** `menuType=MENUTREE_000004&prgId=N000127&menuSeq=MENUTREE_003231`

Mirror of **Sales Invoice Status (Inv.)** (`N000119`) for purchase tax/accounting invoice slips.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Status filter (L2 radios)

All · e-Approval · Unconfirmed · **Confirm** (default)

### Option panel sections

Date (range; default Jul 2026 MTD) · **Accounting Slip No.** · Dept. (Include Sub-groups) · Project · Customer/vendor (Include Sub-groups) · PIC for Customer/Vendor · **Tax Type** (no Tax Entity checkbox — sales-only) · Status (above) · Template · Display Apvl. Line · Sort/Subtotal Criteria · View as Graph

### Toolbar

Search (F8) · date shortcuts incl. **Prev. Qtr** · Reset · Print · Excel

**Tenant note:** Jul 2026 MTD empty with default Confirm filter. **Hash quirk:** deep-link may leave left menu highlighting **Production/OE** subtree while screen title loads correctly.

---

## Monthly Payable Fluctuation (`E040714`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040714&menuSeq=MENUTREE_001387`

Mirror of **Monthly Receivable Change Details** (`E040713`) for AP vendor fluctuation.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Date (range; default **This Month (~ Today)** Jul 2026) · Customer/vendor (Include Sub-groups; ECount label **Customer**) · Customer Relation (Standard vs Individual) · PIC for Customer/Vendor · Include Deactivated Customer/Vendor (default checked) · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings

### Toolbar

Search (F8) · date shortcuts incl. End Date · Reset · Print · Excel

---

## Purchase Invoice Status (`N000126`) — Acct. I

**URL hash:** `menuType=MENUTREE_000001&prgId=N000126&menuSeq=MENUTREE_003230`

Non-Inv. variant mirror of **Purchase Invoice Status (Inv.)** (`N000127`). Under **Acct. I → Reports → Others**. Same filters as `N000127` minus **Tax Entity**; default date **This Month (~ Today)** Jul 2026.

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Purchase Status line inquiry (mirror of sales) | Supplier invoice analytics partial |
| A/P by Vendor Inv. vs Acct. purchase split | AP aging by vendor only |
| Serial/Lot on purchase status lines | GR serial tracking separate from AP report |
| Payable Status as-of (vs A/P range roll-forward) | AP aging uses period range only |
| Purchase Request/Plan status inquiry | No PR/plan analytics |
| Purchase Discount inquiry | No purchase discount report |
| Pre-Invoicing as-of backlog | No uninvoiced purchase report |
| Customer/Vendor Book AP statement | AP sub-ledger statement partial |
| Purchase Invoice Status (Inv.) | No purchase tax-invoice status report |
| Monthly Payable Fluctuation | No AP fluctuation report |

## Tab pill checklist

- [x] E040305 — Default + Type Date/Summary/by Line + grid columns
- [x] E040309 — Default + Type By Customer/Vendor vs by PIC + roll-forward grid
- [x] E040306 — Default + Type Details/Summary/by Line + PO filters (pass 7)
- [x] E040307 — Default + Type by Item/by Line + outstanding PO grid (pass 7)
- [x] E040310 — Default + dept/PIC payment inquiry (pass 7; tenant empty)
- [x] E040722 — Default + as-of date filters (pass 8; tenant empty)
- [x] E040313 — Default + Discount Amount range (pass 9; tenant empty Jul MTD)
- [x] E040318 — Default + Type Details/by Line + PR No. + Delivery Date (pass 9)
- [x] E041015 — Default + Type Details/by Line + item status filters (pass 9)
- [x] E040319 — Default + Base Date as-of + Amount filter (pass 9)
- [x] E040724 — Default + Summary Type By Slip+Details + Email (pass 9)
- [x] N000127 — Default + Status Confirm/e-Approval + Accounting Slip No. (pass 10; tenant empty Jul MTD)
- [x] E040714 — Default + vendor relation radios + month range (pass 10)
- [x] N000126 — Acct. I hash + mirror N000127 filters (pass 11; catalog cross-ref)
