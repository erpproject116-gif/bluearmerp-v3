# Acct. I → Reports → Management Resource (pass 15)

**Audit date:** Jul 7 2026 (pass 15)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Acct. I → Reports → Management Resource  
**Bluearm target:** `/app/finance/reports` (management dashboards)

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Notes |
|--------|-------|---------|-------|
| Cash Report | `E010830` | MENUTREE_000110 | Cash position by dept/project |
| Cash Flow (Deposit and Withdrawal Details) | `E010805` | MENUTREE_000111 | Period comparison cash-flow detail |
| Fund Statement | `E010804` | MENUTREE_000112 | Fund balance statement |
| Fund In./De. Details | `E010815` | MENUTREE_000358 | Fund movement line detail |
| Monthly Income Statement | `E010819` | MENUTREE_000353 | Month-range P&L columns |
| Monthly Cost | `E010824` | MENUTREE_000354 | Cost type Manufacturing/Service/Etc. |
| AR/AP Aging | `E010822` | MENUTREE_000355 | As-of aging summary |
| AR/AP Aging Details | `E010823` | MENUTREE_000356 | Line-level aging buckets |
| Management Report | `E010821` | MENUTREE_000357 | **Acct. I** variant — chart templates |
| Accounting Summary | `E010843` | MENUTREE_000359 | Multi-condition account summary |
| Sales Summary | `N000121` | MENUTREE_003222 | Acct. I sales rollup (not Inv. I) |
| Purchase Summary | `N000128` | MENUTREE_003234 | Acct. I purchase rollup |
| Payments Journal Sum. | `E010835` | MENUTREE_000377 | Payment journal aggregation |
| Receipts Journal Sum. | `E010836` | MENUTREE_000378 | Receipt journal aggregation |
| S/A Journal Sum. | `E010840` | MENUTREE_000379 | S/A journal by employee |

**Navigation:** All screens require `menuType=MENUTREE_000001` (Acct. I hash). Use site-map `menuSeq` with `groupSeq=menuSeq&depth=2`. Reload base ERP URL if workspace freezes after many hash hops.

**Still catalog only:** Custom Report (`E010850`, MENUTREE_001360)

**Distinct prgId note:** **Management Report** under Acct. I is `E010821` (chart templates, e.g. Bank Account Balance Comparison Chart). Inv. I Others uses `E040704` (date-only configurable report) — different programs, same label.

---

## Cash Report (`E010830`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010830&menuSeq=MENUTREE_000110`

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |
| **All** | Extended template drawer |

### Option panel sections

**Date** (range — sample Jun–Jul 2026) · **Dept.** (Include Sub-groups) · **Project** · **Others** — Display Apvl. Line · **Status** preset button

### Date quick buttons

Today · Prev. Day · This Week (~ Today) · Prev. Week · This Month (~ Today) · Prev. Month · Reset — **Search (F8)**

---

## Cash Flow — Deposit and Withdrawal Details (`E010805`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010805&menuSeq=MENUTREE_000111`

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard filter set |
| **All** | Extended template drawer |

### Comparison period options (Type section)

Do Not Use · **Same Period of Prev. Day** (observed default pattern) · Same Period of Prev. Week · Same Period of Prev. Month · Same Period of Prev. Year · Horizontal View · Display Ratio · Including Code

### Option panel sections

**Date** range · **Dept.** · **Project** · Display Apvl. Line · Status — **Search (F8)**

---

## Fund Statement (`E010804`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010804&menuSeq=MENUTREE_000112`

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer |

### Customer relation radios

Standard (default) · Individual — controls how customer/vendor grouping applies to fund balances.

### Option panel sections

**Date** range (Jun–Jul 2026 sample) · **Dept.** · **Project** · Display Apvl. Line · Status

---

## Fund In./De. Details (`E010815`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010815&menuSeq=MENUTREE_000358`

Line-level fund inflow/outflow detail (mirror of Cash Report filter pattern).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer |

### Option panel sections

**Date** (06/2026 ~ 07/2026 sample) · **Dept.** · **Project** · Display Apvl. Line · Status

### Date quick buttons

Today · Prev. Day · This Week (~ Today) · Prev. Week · This Month (~ Today) · Prev. Month · Reset — **Search (F8)**

**Navigation quirk:** After long crawl sessions this screen can render blank or show stale **Fund Statement** title — reload base ERP URL and retry.

---

## Monthly Income Statement (`E010819`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010819&menuSeq=MENUTREE_000353`

Month-column income statement (distinct from point-in-time Income Statement `E010812` under Financial Statements).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer |

### Display toggles

Display **Beginning** · **Increase** · **Ending** (column visibility for monthly columns)

### Option panel sections

**Month range** (Jan–Jul 2026 sample) · **Dept.** · **Project** · Display Apvl. Line

---

## Monthly Cost (`E010824`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010824&menuSeq=MENUTREE_000354`

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer |

### Type filter

**Manufacturing** · **Service** · **Etc.** — cost category dimension

### Display toggles

Display Beginning · Increase · Ending (same pattern as Monthly Income Statement)

---

## AR/AP Aging (`E010822`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010822&menuSeq=MENUTREE_000355`

As-of aging summary for receivables and payables.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer |

### Option panel sections

**As-of Date** · **Customer** (Include Sub-groups) · **Account** · **Dept.** · **PIC for Customer/Vendor** · Include Deactivated Customer/Vendor · Display Apvl. Line

---

## AR/AP Aging Details (`E010823`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010823&menuSeq=MENUTREE_000356`

Line-level aging with bucket columns.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer |

### Type filter

**Receivable** (default) · **Payables** toggle

### Summary dimension

**Summary by PIC** (person-in-charge aggregation option)

### Other filters

**Unit** — 1,000 (amount scaling) · **with Zero Balance** (include zero-balance accounts) · As-of Date · Customer · Account · Dept.

---

## Management Report — Acct. I (`E010821`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010821&menuSeq=MENUTREE_000357`

Configurable management chart/report workspace. Tenant default template: **Bank Account Balance Comparison Chart**.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |
| **All** | Extended template drawer |

### Option panel sections

**Date** range (single-day sample 07/2026) · **Type** lookup (report/chart template selector) · Display Apvl. Line · Status

### Bluearm note

Do not conflate with Inv. I **Management Report** `E040704` — that program is date-only under Inv. I → Reports → Others.

---

## Accounting Summary (`E010843`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010843&menuSeq=MENUTREE_000359`

Multi-dimensional account summary with up to three summary conditions.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer |

### Summary conditions

**Summary Condition 1** — Account (default dimension) · **Summary Condition 2** · **Summary Condition 3** · **Target** (metric selector)

### Comparison period options

Do Not Use · Same Period of Prev. Year · Same Period of Prev. Month · Same Period of Prev. Week · Same Period of Prev. Day · Horizontal View · Display Ratio · Including Code

---

## Sales Summary (`N000121`)

**URL hash:** `menuType=MENUTREE_000001&prgId=N000121&menuSeq=MENUTREE_003222`

Acct. I rollup of sales amounts (N-prefix program — requires Acct. I hash, same pattern as `N000118`/`N000126` invoice status).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

**Date** — Recent 30 Days (06/2026 ~ 07/2026) · **Customer** (Include Sub-groups) · **Dept.** · **Project** · **PIC for Customer/Vendor** · **Sales Amount** — Pretax Amount + Tax · **Tax Type** · **Others** — Exclude Duplicate Amount by Month · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings

### Footer

Print · Excel

### Date quick buttons

Today · Prev. Day · This Week (~ Today) · Prev. Week · This Month (~ Today) · Prev. Month · **Current Period** · Reset — **Search (F8)**

---

## Purchase Summary (`N000128`)

**URL hash:** `menuType=MENUTREE_000001&prgId=N000128&menuSeq=MENUTREE_003234`

Mirror of Sales Summary for purchase-side amounts.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Option panel sections

Same filter layout as `N000121` except **Purchase Amount** — Pretax Amount + Tax (instead of Sales Amount).

---

## Payments Journal Sum. (`E010835`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010835&menuSeq=MENUTREE_000377`

Aggregated payment journal inquiry — summary variant of Fast Entry Payment Journal (`E010408`).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (two-level)

**Details** · **Summary** — sub-types: **by Line** (default) · **by Bank Account and Account** · **Recalculate by Account**

### Comparison period options

Do Not Use · Same Period of Prev. Year/Month/Week/Day · Horizontal View · Display Ratio · Including Code

### Option panel sections

**Date** — Recent 30 Days · **Accounting Slip No.** · **Customer** · **Account** · **Dept.** · **Project** · **Withdrawal Account** · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings · **View as Graph**

### Footer

Print · Excel

---

## Receipts Journal Sum. (`E010836`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010836&menuSeq=MENUTREE_000378`

Mirror of Payments Journal Sum. for receipt-side journals.

### Distinct filter

**Deposit Account** (instead of Withdrawal Account on payments variant)

Otherwise identical Type/Comparison/Template pattern to `E010835`.

---

## S/A Journal Sum. (`E010840`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010840&menuSeq=MENUTREE_000379`

Aggregated S/A (sales & acquisition) journal — ties to Fast Entry S/A Journal form (`E010505`).

### Type sub-types

**by Line** (default) · **by Employee and Account** · **Recalculate by Account**

### Distinct filter

**Employee** lookup (instead of bank account fields on payment/receipt sums)

Otherwise identical comparison/template/graph pattern to `E010835`.

---

## Bluearm gaps (Management Resource)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Cash position reports | Cash Report + Fund Statement + Fund In./De. | Cash management dashboard — **crawled pass 15** |
| Cash flow comparison | Cash Flow detail + period-over-period | Cash flow statement partial — **crawled pass 15** |
| Monthly P&L / cost columns | Monthly IS + Monthly Cost | Period financial analytics — **crawled pass 15** |
| AR/AP aging | Aging + Aging Details | Aging reports — **crawled pass 15** |
| Journal rollups | Payment/Receipt/S-A journal sums | Cash journal analytics — **crawled pass 15** |
| Acct. sales/purchase summary | N000121 / N000128 | Cross-module sales/purchase rollup — **crawled pass 15** |
| Management charts | E010821 chart templates | BI/chart layer missing — **crawled pass 15** |
| Custom Report builder | E010850 | User-defined reports — catalog only |

## Checklist

- [x] Cash Report (E010830)
- [x] Cash Flow (E010805)
- [x] Fund Statement (E010804)
- [x] Fund In./De. Details (E010815)
- [x] Monthly Income Statement (E010819)
- [x] Monthly Cost (E010824)
- [x] AR/AP Aging (E010822)
- [x] AR/AP Aging Details (E010823)
- [x] Management Report Acct. I (E010821)
- [x] Accounting Summary (E010843)
- [x] Sales Summary (N000121)
- [x] Purchase Summary (N000128)
- [x] Payments Journal Sum. (E010835)
- [x] Receipts Journal Sum. (E010836)
- [x] S/A Journal Sum. (E010840)
- [ ] Custom Report (E010850) — catalog only
