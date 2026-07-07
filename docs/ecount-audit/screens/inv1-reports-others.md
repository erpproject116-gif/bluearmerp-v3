# Inv. I → Reports → Others subtree (pass 10–13)

**Audit date:** Jul 7 2026 (pass 10–13)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Inv. I → Reports → Others  
**Bluearm target:** `/app/reports` (proposed cross-module analytics)

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Rows (tenant) |
|--------|-------|---------|---------------|
| AR/AP Status | `E040703` | MENUTREE_001383 | as-of Jul 2026 |
| Daily Profit Status | `E040806` | MENUTREE_001382 | Jul MTD range |
| Daily Costing Status | `E040807` | MENUTREE_002898 | as-of Jul 2026 |
| Sales/Purchases Summary | `E040725` | MENUTREE_002462 | Summary Condition 1–2 + comparison period |
| Summary | `E040710` | MENUTREE_000224 | Six menu-type radios + 3 summary conditions |
| Price Change History | `E040819` | MENUTREE_001627 | by Slip + price type checkboxes |
| Management Report | `E040704` | MENUTREE_000223 | Date-only configurable report |
| Status Grand Total | `E040709` | MENUTREE_001793 | Vertical/Horizontal grand-total matrix |
| View Transaction History | `E040716` | MENUTREE_000211 | Audit trail (title **Change History**) |
| Customer/Vendor Book I | `E010833` | MENUTREE_001384 | Generic AR/AP toggle (Inv. I hash) |
| Customer/Vendor Book II | `E010842` | MENUTREE_001385 | Summary book + foreign currency option |
| All-In-One I | `E040627` | MENUTREE_000663 | Customer-centric workspace dashboard |
| All-in-One II | `E040633` | MENUTREE_001318 | Item-centric workspace dashboard |

**AR/AP-specific book variants (pass 9, separate docs):** Customer/Vendor Book I (AR) `E040723` · Customer/Vendor Book I (AP) `E040724`

**Still cataloged:** Update Balance for Inventory (Reports hub toolbar action, not a report screen)

---

## AR/AP Status (`E040703`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040703&menuSeq=MENUTREE_001383`

Combined **receivable and/or payable** position inquiry (single screen toggling AR vs AP vs both). Distinct from separate **Receivable Status** (`E040721`) / **Payable Status** (`E040722`) line inquiries under Sales/Purchases subtrees.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type filter (L2 radios)

**Receivable** (default) · Payables · Receivable/Payable

### Option panel sections

**As-of Date** (single date — Today Jul 2026 default; not a range) · Customer/vendor (Include Sub-groups) · Customer Relation (Standard vs Individual) · PIC for Customer/Vendor · Include Deactivated Customer/Vendor (default checked) · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings

### Toolbar

Search (F8) · **Today** · **Prev. Day** · **Settings** · Reset · Print · Excel

**Note:** Narrower date toolbar than month-range reports (no This Month / Prev. Month shortcuts on main bar).

---

## Daily Profit Status (`E040806`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040806&menuSeq=MENUTREE_001382`

Margin / profit analytics with configurable **sales amount basis** and **costing method**.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |
| **All** | Extended summary options (comparison periods, horizontal view, ratio display) |

### Type aggregation (L2 radios)

by Line · **by Item** (default) · By Customer/Vendor · by Item/Customer · by Customer / Item · User Customized Summary

### Option panel sections

Date (range; default **This Month (~ Today)** Jul 2026) · Location (Include Sub-groups) · Project · Customer (Include Sub-groups) · Item (category sub-filters: All, Raw Material, Sub Material, Finished Goods, Semi-Finished Goods, Merchandise, Intangible Merchandise; Include Sub-groups) · **Sales Amount** (Pretax Amount vs Pretax Amount + Tax) · **Cost** (FIFO (Sales) vs Monthly Cost vs Purchase Price (Item) vs Purchase Price (Item) - Tax Excluded) · **Category** (All vs Only Returns vs Exclude Returns) · **Transaction Type** (+ **DAILY PROF** preset button) · Display Apvl. Line · Include Items Excluded from Quantity Control · Sort/Subtotal Criteria Settings · View as Graph (on Default pill)

### All-pill comparison options

Do Not Use · Same Period of Prev. Year / Month / Week / Day · Horizontal View · Display Ratio · Including Code

### Toolbar

Search (F8) · date shortcuts (Today through Prev. Month) · Reset · Print · Excel

---

## Daily Costing Status (`E040807`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040807&menuSeq=MENUTREE_002898`

Companion to **Daily Profit Status** (`E040806`) — **cost-only** daily inquiry (no sales amount / margin columns).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |
| **All** | Extended sort/subtotal drawer |

### Option panel sections

**As-of Date** (Today Jul 2026) · Location · Item (category sub-filters) · **Cost** (FIFO (Sales) default · Monthly Cost · Purchase Price (Item) · Purchase Price (Item) - Tax Excluded · **Last Purchase Price**) · Display Apvl. Line · Include Items Excluded from Quantity Control · Include Deactivated Items · Sort/Subtotal Criteria Settings · **Default (N** toolbar cost preset

### Toolbar

Search (F8) · Today · Prev. Day · Settings · Reset · Print · Excel

---

## Sales/Purchases Summary (`E040725`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040725&menuSeq=MENUTREE_002462`

User-configurable **cross-module summary** with up to two grouping dimensions plus a summary target measure.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Only pill in tenant |

### Option panel sections

Date (This Month ~ Today Jul 2026) · **Summary Condition 1** · **Summary Condition 2** · **Summary Target** · Comparison Period (Do Not Use / Same Period Prev. Year–Day) · Horizontal View · Display Ratio · Including Code · **Difference** · Domestic/Foreign · Location · Project · PIC · Mgmt. Field · Customer · Item Code (category sub-filters) · Remark · Category (All / Only Returns / Exclude Returns) · Template · Display Apvl. Line

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Summary (`E040710`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040710&menuSeq=MENUTREE_000224`

Generic **multi-document-type** summary report — same Summary Condition engine as `E040725` but scoped by menu type.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Only pill in tenant |

### Menu Type (L2 radios)

**Sales** (default) · Purchases · Sales Order · Purchase Order · Goods Receipt · Sales/Purchases

### Type / grouping

Summary Condition 1 (default **PIC** + by Code) · Summary Condition 2 · Summary Condition 3 · Summary Target · Comparison Period options (same family as Sales/Purchases Summary)

### Option panel sections

Date (Prev. Month + Current Month Jun–Jul 2026) · Transaction Type · Currency (All/Domestic/Foreign) · Location-Out · Project · Customer · Item (category sub-filters) · Category (All/General/Returns) · Sales type (All/Sales/Sales II) · e-Approval status filters · Template · Display Apvl. Line · **View as Graph**

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

---

## Price Change History (`E040819`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040819&menuSeq=MENUTREE_001627`

Tracks **item price changes** over time by sales/purchase slip.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard columns |
| **All** | Extended filters (Project, PIC, PIC for Customer/Vendor in drawer) |

### Type aggregation

**by Slip** (default button)

### Option panel sections

Date (Jul MTD) · Location · Customer · Item (category sub-filters) · **Price Type** · **Price** checkboxes — All / **Simple Average Price** (default checked) / Max. Price / Min. Price · Display Apvl. Line · Display Qty · Display Change Amount · Include Unchanged Price

### Toolbar

Search (F8) · date shortcuts · Settings · Reset · Print · Excel

---

## Management Report (`E040704`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040704&menuSeq=MENUTREE_000223`

Tenant-customizable **management KPI** report — minimal default filters (layout driven by applied template).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard template |
| **All** | Extended template options in drawer |

### Option panel sections

Date (Jul MTD) · Display Apvl. Line

### Toolbar

Search (F8) · date shortcuts · Settings · Reset · Print · Excel

---

## Status Grand Total (`E040709`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040709&menuSeq=MENUTREE_001793`

Cross-status **grand total matrix** with vertical or horizontal display.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Vertical display default |
| **All** | Comparison period options |

### Type aggregation (L2 radios)

**Vertical** (default) · Horizontal

### Option panel sections

Date (Jul MTD) · Location · Customer · Item (category sub-filters) · Project · Mgmt Field · Domestic/Foreign · Comparison Period (Do Not Use / Same Period Prev. Year–Day) · Display Apvl. Line

### Toolbar

Search (F8) · date shortcuts · Settings · Reset · Print · Excel

---

## View Transaction History (`E040716`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040716&menuSeq=MENUTREE_000211`

**Document change audit trail** — workspace title shows **Change History** (not "View Transaction History").

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (L2 radios)

**Slip** (default) · Basic Code

### Option panel sections

**Work Date** (This Month ~ Today) · **Operation Time** (Use toggle) · **Voucher Date** (Do Not Use default) · Menu (Include Sub-groups + item category sub-filters in drawer) · User · Action · Search only the final history (default checked) · Sort by Modification · Template

### Toolbar

Search (F8) · date shortcuts · Reset · Excel (no Print)

---

## Customer/Vendor Book I — generic (`E010833`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E010833&menuSeq=MENUTREE_001384`

**Combined AR/AP sub-ledger statement** — distinct from Sales/Purchases subtree variants `E040723` (AR-only) and `E040724` (AP-only).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Reports |

### Account Type (L2 radios)

All · **Receivable** (default) · Payables

### Summary Type (L2 radios)

by Slip · **By Slip + Details** (default) · Daily · Monthly · By account voucher

### Option panel sections

Date (Prev. Month + Current Month Jun–Jul 2026) · Customer (Include Sub-groups) · Customer Relation Standard / Based on Individual Customer · Print Data without Customer/Vendor Code · Display Apvl. Line · Sort/Subtotal Criteria Settings · **List** view link

### Toolbar

Search (F8) · date shortcuts · Reset · Print · **Email** · Excel

---

## Customer/Vendor Book II — generic (`E010842`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E010842&menuSeq=MENUTREE_001385`

**Summary-format** partner statement (Book II) — lighter than Book I line detail.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard summary |
| **All** | Extended drawer options |

### Account Type (L2 radios)

All · **Receivable** (default) · Payables

### Option panel sections

Date (Jun 2026 default in tenant) · Customer · Customer Relation Standard / Individual · Display Apvl. Line · Print Data without Customer/Vendor Code · **Display Only Foreign Currency Amount** · **List** view link

### Toolbar

Search (F8) · date shortcuts · Settings · Reset · Print · Excel

---

## All-In-One I (`E040627`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040627&menuSeq=MENUTREE_000663`

**Customer-centric workspace** — not a filter/report screen; aggregates quick navigation and slip entry for a selected customer.

### Layout (no L2 tab pills)

Customer picker · Menu dropdown · Quick-launch links: Customer/Vendor Book II · AR/AP Status · Sales List · Purchase List · Searching voucher · Receivable Status · Payable Status · Customer/Vendor Book I (AR) · Customer/Vendor Book I (AP) · **Slip Entry** button

### Toolbar

Option · Help · Slip Entry

---

## All-in-One II (`E040633`)

**URL hash:** `menuType=MENUTREE_000004&prgId=E040633&menuSeq=MENUTREE_001318`

**Item-centric workspace** — mirror of All-In-One I scoped to an item.

### Layout (no L2 tab pills)

Item picker (sample **Dummy Item** in tenant) · Menu dropdown · Quick-launch links: Inv. Balance by Location · Sales Status · Purchase Status · Inv. Book · Inventory Report · **Slip Entry** button

### Toolbar

Option · Help · Slip Entry

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| AR/AP combined as-of toggle | AR and AP aging are separate screens only |
| Daily Profit with FIFO vs monthly cost radios | No daily margin report with costing method switch |
| Daily Costing as-of with Last Purchase Price | No daily cost-only report |
| Returns-only / exclude-returns profit filter | Sales returns not isolated in profit analytics |
| User Customized Summary profit dimensions | Fixed report groupings only |
| Sales/Purchases Summary engine | No user-defined summary dimensions — **crawled pass 13** |
| Multi doc-type Summary report | No cross-module summary by PIC/item/etc. — **crawled pass 13** |
| Price change audit trail | No price history by slip — **crawled pass 13** |
| Management Report template | No tenant KPI report builder — **crawled pass 13** |
| Status Grand Total matrix | No cross-status rollup dashboard — **crawled pass 13** |
| Document change history | Limited audit log vs slip/basic-code trail — **crawled pass 13** |
| Customer/Vendor Book I/II generic | AR/AP statements exist; no Book II or combined toggle — **crawled pass 13** |
| All-In-One customer/item workspaces | No unified partner/item cockpit — **crawled pass 13** |

## Tab pill checklist

- [x] E040703 — Default + Type Receivable/Payables/Combined + as-of date (pass 10)
- [x] E040806 — Default/All pills + Type by Item + Sales Amount/Cost radios (pass 10)
- [x] E040807 — Default/All + Cost FIFO/Last Purchase Price (pass 11)
- [x] E040725 — Default + Summary Condition 1/2/Target (pass 13)
- [x] E040710 — Default + Menu Type six radios + Summary Conditions (pass 13)
- [x] E040819 — Default/All + by Slip + price type checkboxes (pass 13)
- [x] E040704 — Default/All + date-only Management Report (pass 13)
- [x] E040709 — Default/All + Vertical/Horizontal grand total (pass 13)
- [x] E040716 — Default + Slip/Basic Code audit type (pass 13)
- [x] E010833 — Default + AR/AP toggle + five summary types (pass 13)
- [x] E010842 — Default/All + Book II summary options (pass 13)
- [x] E040627 — All-In-One I workspace (no filter pills) (pass 13)
- [x] E040633 — All-in-One II workspace (pass 13)
