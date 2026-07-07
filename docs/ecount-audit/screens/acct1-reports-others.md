# Acct. I → Reports → Others (pass 16)

**Audit date:** Jul 7 2026 (pass 16)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Acct. I → Reports → Others  
**Bluearm target:** `/app/finance/reports`

## Screens depth-audited this pass

| Screen | prgId | menuSeq | Notes |
|--------|-------|---------|-------|
| Accounting Transaction Status | `E010847` | MENUTREE_001906 | Live title **Voucher Status** |
| Print Voucher | `E010702` | MENUTREE_000099 | Voucher print inquiry + Sort by Modified Date |
| Sales Invoice Status | `N000118` | (Acct. I Others) | **Pass 11** — see `inv1-sales-reports.md` |
| Purchase Invoice Status | `N000126` | (Acct. I Others) | **Pass 11** — see `inv1-purchase-reports.md` |
| Accounting vs. Inventory | `E010730` | MENUTREE_001533 | GL vs Inv. reconciliation by period |
| All-In-One I | `E040627` | **MENUTREE_001352** | Customer cockpit (Acct. I hash; not site-map 000663) |
| View Transaction History | `E010712` | MENUTREE_000095 | Live title **Change History (Acct.)** |
| Update Balance for Accounting | `E010705` | MENUTREE_000114 | GL balance rebuild by month range |

**Navigation:** All screens require `menuType=MENUTREE_000001`. **Click Acct. I module tab first** (or reload + wait) before deep-linking — otherwise workspace renders blank with company name title.

**Distinct prgId notes:**
- **View Transaction History** under Acct. I is `E010712` (accounting voucher audit). Inv. I Others uses `E040716` (inventory/slip audit) — same menu label, different programs and filter sets.
- **All-In-One I** shares `prgId=E040627` with Inv. I but Acct. I path uses tenant `menuSeq=MENUTREE_001352`.

---

## Accounting Transaction Status (`E010847`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010847&menuSeq=MENUTREE_001906`

Site Map label **Accounting Transaction Status**; live workspace title is **Voucher Status** — GL voucher inquiry/status report.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template Default (Not Editable) |

### Type aggregation (two-level)

**Details** · **Summary** — sub-types: **Daily** · **Monthly** · **by Slip** (default) · **By Customer/Vendor**

### Comparison period options

Do Not Use · Same Period of Prev. Year/Month/Week/Day · Horizontal View · Display Ratio · Including Code

### Option panel sections

**Date** — Recent 30 Days (06/2026 ~ 07/2026) · **Accounting Slip No.** · **Customer** · **Account** · **Dept.** · **Project** · **Transaction Type** · **Amount** ~ · **AR/AP(Note)No.** · **Remark** · Template · Display Apvl. Line · Sort/Subtotal Criteria Settings · **View as Graph**

### Footer

Print · Excel

### Date quick buttons

Today · Prev. Day · This Week (~ Today) · Prev. Week · This Month (~ Today) · Prev. Month · **End Date** · Reset — **Search (F8)**

---

## Print Voucher (`E010702`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010702&menuSeq=MENUTREE_000099`

Voucher selection screen for batch printing — filter then print selected accounting slips.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Standard filter set |
| **All** | Extended template drawer |

### Option panel sections

**Date** (06/2026 ~ 07/2026) · **Accounting Slip No.** · **Customer** · **Account** · **Dept.** · **Project** · **Transaction Type** · **Amount** ~ · **Note No.** · **Remark** · **Initial Creator** · **Last Modifier** · **Others** — Sort by Modified Date

### Date quick buttons

Today · Prev. Day · This Week (~ Today) · Prev. Week · This Month (~ Today) · Prev. Month · **Current Period** · Reset — **Search (F8)**

**Toolbar:** Print action on result grid (after search)

---

## Sales / Purchase Invoice Status (`N000118` / `N000126`)

Listed under Acct. I → Reports → Others in the hub tree. Depth-audited **pass 11** with `menuType=MENUTREE_000001` — mirror Inv. I variants `N000119`/`N000127` but under accounting menu path.

See `inv1-sales-reports.md` (N000118) and `inv1-purchase-reports.md` (N000126).

---

## Accounting vs. Inventory (`E010730`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010730&menuSeq=MENUTREE_001533`

Cross-module reconciliation comparing **accounting GL amounts** to **inventory transaction amounts** for a period — critical parity report for Bluearm.

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | |
| **All** | Extended drawer (Initial Creator · Last Modifier in All pill) |

### Accounting-side filters

**Date** (month range 06/2026 ~ 07/2026) · **Acct. Customer/Vendor** · **Accounting Account** · **Acct. Dept.** · **Acct. Project**

### Inventory-side filters

**Inv. Type** — **Sales** (default button; other types in drawer) · **Inv. Customer/Vendor** · **Inv. Location** · **Inv. Project**

### Amount basis

**Pretax Amount** (default) · **Total Amount**

### Target dimension checkboxes

**Project** (checked) · **Customer** (checked)

### Date quick buttons

This Month (~ Today) · Prev. Month · Prev. Month + Current Month · Current Year · Prev. Year · Settings · Reset — **Search (F8)**

---

## All-In-One I — Acct. I path (`E040627`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E040627&menuSeq=MENUTREE_001352`

Customer-centric **workspace dashboard** (same prgId as Inv. I Others entry; different `menuSeq` under Acct. I).

### Entry filters (no L2 tab pills)

**Customer** lookup · **Menu** lookup

### Quick-link tiles (workspace)

Customer/Vendor Book II · AR/AP Status · Sales List · Purchase List · Searching voucher · Receivable Status · Payable Status · Customer/Vendor Book I (AR) · Customer/Vendor Book I (AP)

### Toolbar

**Slip Entry** · Option · Help

**Bluearm note:** Same concept as Inv. I pass 13 crawl (`inv1-reports-others.md`) but opened from Acct. I Reports → Others with accounting hash.

---

## View Transaction History — Acct. I (`E010712`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010712&menuSeq=MENUTREE_000095`

Accounting **voucher change audit trail**. Live title **Change History (Acct.)** — not the same as Inv. I `E040716` (**Change History**).

### L2 tab pills

| Pill | Notes |
|------|-------|
| **Default** | Applied template |
| **All** | Extended drawer |

### Option panel sections

**Work Date** (This Month ~ Today Jul 2026) · **Operation Time** (Use toggle) · **Voucher Date** (Do Not Use default) · **Voucher Status** — All · e-Approval · Unconfirmed · Confirm (all checked default) · **Customer** · **Dept.** · **Project** · **Transaction Type** · **Account** · **Amount** ~ · **Remark** · **Accounting Slip No.** · **User** · **Action** · **Others** — Search only the final history (checked) · Sort by Modification

### Toolbar

Search(F3) · Option · Help · Search (F8) · date shortcuts · Reset

**Navigation quirk:** Hash-only navigation can show stale prior screen title — use left-menu click or wait ~5s after navigation.

---

## Update Balance for Accounting (`E010705`)

**URL hash:** `menuType=MENUTREE_000001&prgId=E010705&menuSeq=MENUTREE_000114`

Administrative action to **rebuild GL balance aggregates** for a month range — also linked from Reports hub toolbar.

### Screen layout (no filter pills)

| Field | Sample |
|-------|--------|
| **Start Month** | 07/2026 |
| **End Month** | 07/2026 |

### Primary action

**Update Balance for Accounting (F8)** — executes balance rebuild for selected months

### Toolbar

Help only (no Option pill, no search grid)

**Bluearm note:** Map to period-close / balance rebuild batch job — high-privilege accounting operation.

---

## Bluearm gaps (Acct. I Others)

| Gap | ECount | Bluearm target |
|-----|--------|----------------|
| Voucher status inquiry | E010847 Voucher Status | GL voucher analytics — **crawled pass 16** |
| Batch voucher print | E010702 Print Voucher | Voucher print queue — **crawled pass 16** |
| Acct vs Inv reconciliation | E010730 | Accounting vs inventory report — **crawled pass 16** |
| Acct. change history | E010712 Change History (Acct.) | Voucher audit trail — **crawled pass 16** |
| GL balance rebuild | E010705 Update Balance | Period close / rebuild — **crawled pass 16** |
| Customer cockpit (Acct.) | E040627 All-In-One I | Partner workspace — **crawled pass 16** (shared prgId Inv. I) |
| Tax invoice status (Acct.) | N000118 / N000126 | Pass 11 — finance tax slip status |

## Checklist

- [x] E010847 — Voucher Status (Accounting Transaction Status)
- [x] E010702 — Print Voucher
- [x] N000118 / N000126 — cross-ref pass 11
- [x] E010730 — Accounting vs. Inventory
- [x] E040627 — All-In-One I (Acct. I menuSeq)
- [x] E010712 — Change History (Acct.)
- [x] E010705 — Update Balance for Accounting
