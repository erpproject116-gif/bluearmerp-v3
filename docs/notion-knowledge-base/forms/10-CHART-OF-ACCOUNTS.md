# Chart of accounts & default mappings

**Path:** `/app/finance/acct-i/chart-of-accounts`  
**Permission:** `finance.journal_entries`  
**Feature:** Ledger / Bookkeeping (`finance.acct_i`)  
**Form Settings:** No · draft key `fin_account`  
**Observed:** `web/src/modules/finance/ChartOfAccountsPage.tsx`

Bank **registers** (OR/PV banking) are **not** the same as GL cash accounts.

---

## Window kind

| Area | Kind |
|------|------|
| Chart list / tree | master (GL accounts) |
| New / Edit account modal | master form |
| Default account mappings | config (tenant defaults) |
| Import PH SME template | config / bulk |

Views: **simple** (tree, large page) · **accountant** (spreadsheet list). Stored in localStorage `coa.viewMode`.

Filters: search · status active/inactive/deleted · account_type.

---

## Account form (create / edit)

API: `POST/PATCH /api/v1/finance/accounts`

| Field | Type | Notes |
|-------|------|-------|
| account_code | text | Required in practice (trimmed); unique codes |
| account_name | text | Required in practice |
| account_type | select | `asset` \| `liability` \| `equity` \| `income` \| `expense` |
| parent_id | select | Optional parent account (tree) |
| is_group | checkbox | Group/header node (children under it) |
| is_active | checkbox | Default true |
| sort_order | number | Default 0 |

Read-only / system flags on row: `is_system`, `child_count`, `parent_code` / `parent_name`.

### PH code bands (UI hint)

| Type | Typical codes |
|------|----------------|
| asset | 1000–1999 |
| liability | 2000–2999 |
| equity | 3000–3999 |
| income | 4000–4999 |
| expense | 5000–5999 |

### Lifecycle actions

| Action | Behavior |
|--------|----------|
| Activate / Deactivate | PATCH `is_active` |
| Remove | Soft-delete (DELETE) · **system accounts cannot be removed** — deactivate instead |
| Restore | POST `.../accounts/{id}/restore` for deleted rows |

---

## Default account mappings

Section on same page (`#default-account-mappings` / focus=purchase).  
API: `GET/PATCH /api/v1/finance/accounts/defaults` · draft `fin_account_defaults`

Maps **slots → GL account ids**. Slot pickers filter by allowed `account_type`.

| Slot key | Label | Allowed types | Used for |
|----------|-------|---------------|----------|
| cash_account_id | Cash / bank receipts | asset | Official receipts, POS cash |
| receivable_account_id | Accounts receivable | asset | Sales on credit, POS A/R |
| payable_account_id | Accounts payable | liability | Supplier invoices on credit |
| sales_account_id | Sales revenue | income | Sales invoices and POS |
| purchase_account_id | Purchases (non-stock expense) | expense | Services / non-qty on supplier invoices |
| inventory_account_id | Inventory asset | asset | Qty-tracked stock on hand (e.g. 1200) |
| grni_account_id | GRNI clearing | liability | Goods received not invoiced (e.g. 2115) |
| cogs_account_id | COGS (stock issues) | expense | Debited when qty-tracked items sold |
| input_vat_account_id | Input VAT | asset | VAT paid to vendors |
| output_vat_account_id | Output VAT | liability | VAT on sales |
| commission_expense_account_id | Sales commissions (expense) | expense | Commission accrual |
| commission_payable_account_id | Commissions payable | liability | Until paid |
| ewt_payable_account_id | EWT payable | liability | Expanded WHT on PVs (BIR 2307) |
| fwt_payable_account_id | FWT payable | liability | Final WHT |
| compensation_wht_payable_account_id | Compensation WHT payable | liability | Payroll WHT |
| ewt_receivable_account_id | EWT receivable | asset | Creditable WHT from customers |

Also on defaults object:

| Key | Meaning |
|-----|---------|
| auto_post_commission_journal | bool — auto JE for commissions |
| disabled_account_types | string[] — hide types from UI |

**Ensure Purchases/COGS:** `POST /api/v1/finance/accounts/ensure-purchase-cogs` can create/map purchase + related defaults when missing.

**Inventory GL hybrid:** Process policy `inventory_gl_hybrid_enabled` posts Inventory / GRNI / COGS — map those three slots **before** enabling (**Observed** help text).

---

## Import Philippine SME template

API: `POST /api/v1/finance/accounts/import-template`  
Body: `{ template: "ph_sme", replace?: boolean }`

| Mode | Behavior |
|------|----------|
| Import (add) | Loads ~35 standard PH SME accounts |
| Replace | Soft-deletes current accounts then imports · journal history stays linked to soft-deleted codes |

Setup wizard step `chart_of_accounts` asks operators to review seeded CoA before trading.

---

## Related transaction windows

| Window | How CoA appears |
|--------|-----------------|
| Journal Entry | Line `account_code*` — see `06-ACCOUNTING-WINDOWS.md` |
| Official Receipt / PV | Auto-post JE uses cash / AR / AP mappings |
| Sales / Supplier Invoice | Revenue / purchase / VAT / inventory hybrid |
| POS | Cash / AR / sales / optional auto-post |

---

## Gates / caveats

| Gate | Notes |
|------|-------|
| Core types for healthy books | asset, liability, income, expense (equity optional) |
| System accounts | Cannot soft-delete |
| Empty chart | Import PH template |
| Hybrid inventory GL | Needs inventory + GRNI + COGS mapped |
| Bank accounts module | Separate from GL cash account |

---

## Related

| Topic | File |
|-------|------|
| OR / SI / PV / JE | `06-ACCOUNTING-WINDOWS.md` |
| Deep accounting | `../16-DEEP-ACCOUNTING-FORMS.md` |
| Setup / foundation | `../03-COMPANY-JOURNEY.md` |
| Process policies | `../05-PROCESS-POLICIES-AND-GATES.md` |
