# Acct. I — Reports → Book + Financial Statements (pass 3)

**Module path:** Acct. I → **Reports** → Book / Financial Statements subtrees  
**Audit status:** pass 3 — live crawl Jul 7 2026  
**Bluearm target:** `/app/finance/reports`

## Book subtree (Site Map)

LedgerⅠ · LedgerⅡ · LedgerⅢ · Ledger IV · Account In./De. Details · Sales/Purchase Book · **Journal** · Cash Book · Daily Trial Balance · Currency Ledger · Search Customer/Vendor Transactions · Customer/Vendor Book I/II

---

## Journal (`E010802`) — GL journal report

**L2 filter pills:** Default

| Filter section | Fields |
|----------------|--------|
| Date | Range — Recent 30 Days default (06/2026 ~ 07/2026 sample) |
| Accounting Slip No. | |
| Customer / Account / Dept. / Project | Lookups |
| Transaction Type | |
| Amount | Range ~ |
| Receivable/Payable (Note) No. | |
| Remark | |
| Others | View only differences between Dr. & Cr. data. |
| Template | Applied Template · Template Type |
| Display Apvl. Line | |
| Sort/Subtotal Criteria | Settings |

**Date quick buttons:** Today, Prev. Day, This Week, Prev. Week, This Month, Prev. Month, Current Period, Reset — **Search (F8)**

**Footer:** Print, Excel

---

## Daily Trial Balance (`E010803`) — inquiry

**L2 filter pills:** Default · All · **Type** (Monthly Trial Balance / Daily Trial Balance)

| Filter section | Fields |
|----------------|--------|
| Date | Range (single-day sample 06/2026 ~ 06/2026) |
| Dept. / Project | |
| Others | Display Apvl. Line · Status |

**Date quick buttons:** Today, Prev. Day, This Week, Prev. Week, This Month, Prev. Month, Reset — **Search (F8)**

---

## LedgerⅠ (`E010807`) — account ledger inquiry

**L2 filter pills:** Default

**Type radio group:** by Line (default) · Daily · Monthly · Recalculate by Account

| Filter section | Fields |
|----------------|--------|
| Date | Range (sample 06/01/2026 ~ 06/30/2026) |
| Dept. | Include Sub-groups |
| Project | |
| Account | |
| Others | Including Beginning Amount (checked) · Exclude cust./vend. without transactions |
| Template | Applied Template · Template Type |
| Data View Format | Display Apvl. Line · View as Graph |

**Date quick buttons:** Today, Prev. Day, This Week (~ Today), Prev. Week, This Month (~ Today), Prev. Month, Current Period, Reset — **Search (F8)**

**Footer:** Print, Excel

---

## Balance Sheet (`E010813`) — financial statement

**L2 filter pills:** Default

| Filter section | Fields |
|----------------|--------|
| Dept. Display Type | Summary (default) · Vertical · Horizontal |
| Project Display Type | Summary (default) · Vertical · Horizontal |
| Date | Month picker (sample 07/2026) |
| Comparison | Prev. Period (default) · Same Period of Prev. Period · Grand Total of Current Year · Set Manually · Not Selected |
| Dept. | Include Sub-groups |
| Project | |
| Others | Unit: 1,000 · with Zero Balance · Exclude blank contents of department/project. · Entry Account · Include Deactivated/Deleted |
| Template | Applied Template Default (Not Editable) |

**Date quick buttons:** This Month (~ Today), Prev. Month, Prev. Period, Settings, Reset — **Search (F8)**

**Footer:** Print, Excel

---

## Income Statement (`E010812`) — financial statement

**L2 filter pills:** Default

Same layout as Balance Sheet with these differences:

| Filter section | Notes |
|----------------|-------|
| Date | **Range** (sample 01/2026 ~ 07/2026) |
| Others | Adds **Display Beginning,Increase,Ending** checkbox |
| Date quick buttons | Adds **Current Period** |

---

---

## Ledger variants comparison (Ⅰ–Ⅳ)

| Variant | prgId | Type radios (4th option) | Customer dimension | Unique filters |
|---------|-------|--------------------------|-------------------|----------------|
| **LedgerⅠ** | `E010807` | Recalculate by Account | — | Exclude cust./vend. without transactions |
| **LedgerⅡ** | `E010808` | **Summary by Customer/Vendor** | Customer + PIC for Customer/Vendor | Customer Relation Standard vs Individual Customer · Data without Cust./Vend. Code Only · Include Deactivated Customer/Vendor |
| **LedgerⅢ** | `E010809` | Recalculate by Account | Customer + relation radios | Exclude **account** without transactions (not cust/vend) |
| **Ledger IV** | `E010856` | *(tenant: screen did not render filters — empty body)* | — | Navigates via menu; may require additional license/setup |

All rendered ledger variants share: Default pill · by Line/Daily/Monthly · date range · dept/project/account · beginning balance · template · graph view · Search (F8) · Print/Excel.

---

## LedgerⅡ (`E010808`) — customer-centric ledger

Same shell as LedgerⅠ with **Summary by Customer/Vendor** as 4th Type option.

Additional filter sections: **Customer** (Include Sub-groups) · **Add to Main Customer** (Customer Relation Standard / Based on Individual Customer) · **PIC for Customer/Vendor** · Others adds Data without Cust./Vend. Code Only · Include Deactivated Customer/Vendor.

---

## LedgerⅢ (`E010809`) — account + customer ledger

LedgerⅠ Type radios (Recalculate by Account) **plus** Customer field and Customer Relation Standard / Individual Customer radios. Others: Exclude account without transactions.

---

## Statement of Cash Flows (`E010861`) — period list + entry

**Screen type:** List by accounting period (not inline inquiry form).

| UI element | Notes |
|------------|-------|
| Period row | e.g. `7(01/2026 ~ 12/2026)` with **Enter** · **Print** per period |
| Toolbar | Search (F3), Option, Help, **New (F2)**, Excel |
| Option gear | Search Field Settings · Template Settings · Condition Template Settings · Field Settings |
| Filter panel | Default pill · Accounting Period · PeriodSelect · Template |

**New (F2) modal — create period:**

| Field | Notes |
|-------|-------|
| Accounting Period | Period number (sample `8`) |
| Period | Date range 01/2026 ~ 12/2026 |
| Target Item | All / Select radios |
| Actions | Save (F8) · Close |

Row **Enter** opens **period entry modal** (pass 4 Jul 2026):

| Header | Accounting Period `7` · Period January 01, 2026 ~ December 31, 2026 |
|--------|---------------------------------------------------------------------|
| Toolbar | Option · **Apply Formula** · Save (F8) · Delete · Close |
| Grid columns | Field Name · Amount · Field Code · Display Order · Field Type |

**Cash-flow sections (Field Type = Summary or Enter(Designate Manually)):**

- Ⅰ. CASH FLOWS FROM OPERATING ACTIVITIES — Net income (or loss); Addition of expenses not involving cash outflows (Depreciation, Retirement allowance, …); Deduction of revenues not involving cash inflows; Changes in assets and liabilities
- Ⅱ. CASH FLOWS FROM INVESTING ACTIVITIES — Cash inflows / outflows
- Ⅲ. CASH FLOWS FROM FINANCING ACTIVITIES — Cash inflows / outflows
- Ⅳ. INCREASE (or DECREASE) IN CASH (Ⅰ+Ⅱ+Ⅲ)

Sample rows use Field Code `00001`–`00005` with Amount `0.00` in tenant. **Apply Formula** recalculates from GL; manual lines use **Enter(Designate Manually)** type.

---

## Retained Earnings Statement (`E010817`) — period list

Same list pattern as Statement of Cash Flows: toolbar **New (F2)** only (minimal body in tenant — likely empty until periods created).

---

## Cash Book (`E010801`) — cash account movements

**Menu path:** Acct. I → Reports → Book → **Cash Book**  
**URL:** `prgId=E010801`, `menuSeq=MENUTREE_000113`  
**Audit:** pass 5 Jul 2026

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Date (Recent 30 Days default + quick ranges incl. **Current Period**) · Dept. (Include Sub-groups) · Project · **Include Deposit** checkbox · Template · Display Apvl. Line · View as Graph

### Toolbar

Search (F8) · date shortcuts · Reset · Print · Excel

**Tenant note:** Filter UI renders; search returned **no grid rows** in Jul 2026 window (likely no cash-book postings or template uses non-`th` grid). Re-test after cash voucher activity.

---

## Sales/Purchase Book (`N000122`) — blocked in tenant

**Site map:** `prgId=N000122`, `menuSeq=MENUTREE_003223`  
**Menu path:** Acct. I → Reports → Book → Sales/Purchase Book

**Tenant note:** Hash navigation and left-menu click both leave workspace **without filter UI** (title stuck on prior screen). Same empty-render pattern as Ledger IV `E010856`. Catalog only until tenant license/setup verified.

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Cash Book with Include Deposit + dept/project | Cash ledger report partial |
| Sales/Purchase Book combined inquiry | No combined sales/purchase GL book |
| Journal report with Dr/Cr diff filter | General ledger report partial |
| Daily vs monthly trial balance | Trial balance only |
| Ledger I–IV variants + customer relation modes | Single ledger view |
| Balance Sheet / IS with dept/project display types | No multi-dimensional FS |
| FS comparison columns (Prev. Period, YoY) | Limited comparative reporting |
| Statement of Cash Flows period entry workflow | No cash flow statement module |
| Retained earnings statement | Not implemented |

## Tab pill checklist

- [x] E010802 Journal — Default pill + filter sections
- [x] E010803 Daily Trial Balance — Default/All/Type pills
- [x] E010807 LedgerⅠ — Default pill + Type radios (by Line/Daily/Monthly/Recalculate)
- [x] E010808 LedgerⅡ — customer-centric Type + relation radios
- [x] E010809 LedgerⅢ — account+customer hybrid
- [ ] E010856 Ledger IV — tenant empty render
- [x] E010813 Balance Sheet — Default pill + dept/project display types
- [x] E010812 Income Statement — Default pill + date range + Beginning/Increase/Ending
- [x] E010861 Statement of Cash Flows — period list + New period modal + **Enter line grid**
- [x] E010817 Retained Earnings — list shell (New F2)
- [x] E010801 Cash Book — Default pill + dept/project/Include Deposit (tenant empty grid)
- [ ] N000122 Sales/Purchase Book — empty render in tenant
