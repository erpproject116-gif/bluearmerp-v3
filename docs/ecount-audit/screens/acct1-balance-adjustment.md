# Acct. I — Balance Adjustment subtree

**Module path:** Acct. I → **Fast Entry** → Balance adjustment programs  
**Bluearm target:** `/app/finance/period-close`, opening balance / trial balance adjustment  
**Audit status:** pass 3 — live crawl Jul 7 2026 (Bal. Count By Customer/Vendor + E010210 F2 workflow)

## Programs (prgId map)

| Program | prgId | menuSeq | Type |
|---------|-------|---------|------|
| **New Balance Adjustment** | E010209 | MENUTREE_001699 | Inquiry + per-account **Adjust** |
| **Bal. Count List** | E010211 | MENUTREE_001706 | List + New (F2) |
| **Balance Adjustment List** | E010210 | MENUTREE_001701 | Posted adjustment list |
| **Bal. Adjustment Status** | E010212 | MENUTREE_001801 | Status report / inquiry |

---

## E010209 — New Balance Adjustment

Opening / period balance review screen. Search loads all GL accounts with Dr/Cr balances for a **single date**.

### L2 filter pills

| Pill | Notes |
|------|-------|
| **Default** | Saved filter template |
| **All** | Show all filter sections |

### Header filters

| Filter | Options |
|--------|---------|
| Date | Single date (default 06/30/2026 in tenant) |
| Account Category | All, Assets, Liabilities, Equity, I/S, Cost1, Cost2, Cost3, None |
| Dept. | Include Sub-groups |
| Project | Lookup |
| Account | Lookup |
| Others | **with Zero Balance** (checked by default) |

### Date quick buttons

Today, Prev. Day, **Last Day**, Prev. Month, Prev. Period, Settings, Reset — **Search (F8)** loads grid.

### Result grid columns

| Column | Notes |
|--------|-------|
| Account | GL code (e.g. 1020 Cash on Hand) |
| Account Name | |
| Balance Type | **by Account Code** or **By Customer/Vendor** (sub-ledger) |
| Dr. Amount | Debit balance |
| Cr. Amount | Credit balance |
| Progress Status | (empty in sample rows) |
| **Adjust** | Per-row link to post adjustment |

Tenant sample: 100+ accounts loaded (Cash, AR 135M, VAT Paid 8.1M, etc.).

### Adjust row action → **Bal. Count** modal

Clicking **Adjust** on a grid row opens nested modal (title varies by balance type). Modal AMD bundle may take 15–30s to render; avoid **Open in new window** (standalone `EBA062P_01` errored in automation).

#### Bal. Count(by Account Code) — from `1020 Cash on Hand` (by Account Code)

| Header | Value (sample) |
|--------|----------------|
| Date | 06/30/2026 (inherits inquiry date) |
| Account | `[1020] Cash on Hand` |

Toolbar: Search (F3)

| Column | Notes |
|--------|-------|
| Row # | 1–3 blank detail rows + totals |
| Book Balance | GL balance (read-only) — `570,167.86` |
| Actual Balance | Editable count entry — pre-filled with book balance |
| Adjusted Amount | Computed delta — `0.00` when actual = book |
| Remark Code / Remark Name | Optional remark lookup fields |

**Footer options**

| Control | Notes |
|---------|-------|
| Balance Adjustment | Checkbox (checked by default) — post adjustment voucher when saved |
| Adjust the balance of unchanged details to 0. | Optional checkbox |
| Save (F8) | Persist count + optional adjustment |
| ECOUNT Web Uploader | Bulk line import |
| Close | Dismiss without save |

#### Bal. Count(By Customer/Vendor) — from `1024 GCASH - 0013` (By Customer/Vendor)

| Header | Value (sample) |
|--------|----------------|
| Date | 06/30/2026 (inherits inquiry date) |
| Account | `[1024] GCASH - 0013` |

Toolbar: Search (F3)

| Column | Notes |
|--------|-------|
| Customer/Vendor Code | Sub-ledger party code (e.g. BERDEL, CARLSON, GAB) |
| Customer/Vendor Name | Party name |
| Book Balance | GL sub-ledger balance (read-only) |
| Actual Balance | Editable count entry — pre-filled with book balance |
| Adjusted Amount | Computed delta — `0.00` when actual = book |
| Remark Code / Remark Name | Optional remark lookup fields |

Tenant sample: **22 customer lines** + blank rows; totals **86,054.70** book/actual, adjusted **0.00**.

**Footer options** — same as account-code variant:

| Control | Notes |
|---------|-------|
| Balance Adjustment | Checkbox (checked by default) |
| Adjust the balance of unchanged details to 0. | Optional checkbox |
| Save (F8) | Persist count + optional adjustment |
| ECOUNT Web Uploader | Bulk line import |
| Close | Dismiss without save |

**Standalone URL pattern:** `ec3/view/EBA/EBA062P_01?is_standalone=true` · parent `programID` `E010209` · `IsFromDetailAdjustment: true`

---

## E010211 — Bal. Count List

Physical / actual balance **count** documents before adjustment posting.

### Toolbar

Search (F3), Option, Help, **New (F2)**, Delete Selected

### Option filter pills (Default)

| Section | Fields |
|---------|--------|
| Date | Range (06/2026 ~ 07/2026) |
| Dept. | Select, Include Sub-groups |
| Project | Select |
| Customer | Select, Include Sub-groups |
| Account | Select |
| Amount | Range ~ |
| Remark | Text |
| Last Updated Date | Range + **Use** toggle |
| Last Modifier | Select |
| Delete Type | **All** / **Undeleted** / **Delete** |
| Type | **All** / **by Account Code** / **By Customer/Vendor** |

Footer labels also show **Acct.** and **Pre-invoicing** type hints.

### List columns

| Column | Notes |
|--------|-------|
| Type | by Account Code / By Customer/Vendor |
| Voucher Date | Count document date |
| Account Name | |
| Book Values | Book balance at count |
| Actual Price | Counted balance |
| Account Voucher | Linked GL voucher |

**Empty state:** `No data has been registered.`

### New (F2) behavior

**New (F2)** does **not** open a blank count slip inline. It launches nested **New Balance Adjustment** (`E010209`) account inquiry modal (same filter pills + Search F8 grid as main screen). User picks account → **Adjust** → **Bal. Count** entry modal.

Workflow: **Bal. Count List → New (F2) → E010209 inquiry → Adjust → Bal. Count form → Save**

---

## E010210 — Balance Adjustment List

Posted balance adjustment slips.

### Toolbar

Search (F3), Option, Help, New (F2), **Print**, Delete Selected

### Option filter (Default)

Date range, Dept., Project, Customer, Account, Amount, Remark — same pattern as Bal. Count List (no Delete Type / Last Updated in snapshot).

### List columns

| Column | Notes |
|--------|-------|
| Bal. Adjustment No. | Document number |
| Account Name | |
| Book Values | GL book balance |
| Actual Price | Counted / actual balance |
| Print | Print link |

**Empty state:** No data has been registered.

### New (F2) behavior

**New (F2)** does **not** open a blank posted-adjustment form inline. It launches nested **New Balance Adjustment** (`E010209`) account inquiry modal — **same pattern as E010211 Bal. Count List**.

Workflow: **Balance Adjustment List → New (F2) → E010209 inquiry → Adjust → Bal. Count form → Save**

---

## E010212 — Bal. Adjustment Status

Analytical status report comparing book vs actual balances over a date range.

### L2 filter pills

Default + date range (Prev. Month default: 06/01/2026 ~ 06/30/2026)

### Filters

Same Account Category pills as E010209, plus **Customer** lookup, **Display Apvl. Line**, **View as Graph** toggle.

### Date quick buttons

Today, Prev. Day, This Week (~ Today), Prev. Week, This Month (~ Today), Prev. Month, Recent 30 Days

### Footer toolbar

Search (F8), Reset, Print, Excel, **Compare with Actual Balance**

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| New Balance Adjustment grid + Adjust per account | No opening balance adjustment UI |
| Bal. Count List (physical count docs) | No balance count workflow |
| Balance Adjustment List | No posted adjustment register |
| Bal. Adjustment Status report | Trial balance only — no book vs actual compare |
| Sub-ledger balance type (By Customer/Vendor) | Party sub-ledger on COA partial |

## Tab pill checklist

- [x] E010209 Default/All pills + account category pills
- [x] E010209 grid columns + Adjust link
- [x] E010211 Option pills (Delete Type, Type by account/customer)
- [x] E010210 list columns
- [x] E010212 status filters + Compare with Actual Balance
- [x] E010209 Adjust modal — Bal. Count(by Account Code) fields
- [x] E010211 New (F2) → nested E010209 inquiry (not blank slip)
- [x] E010209 Adjust modal — Bal. Count(By Customer/Vendor) fields (22-party sample on 1024 GCASH)
- [x] E010210 New (F2) → nested E010209 inquiry (not blank posted slip)
