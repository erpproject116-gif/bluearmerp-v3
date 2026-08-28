# Accounting windows — OR, SI, PV, JE, hubs

Deep narrative: `../16-DEEP-ACCOUNTING-FORMS.md`  
OR + Supplier Invoice headers: `01-FORMFIELDS-REGISTRY.md`

---

## Official Receipt — `/app/finance/official-receipts` · `fin_official_receipt`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** |
| **Header*** | receipt_date, partner (customer), currency, payment_method · + reference_no, notes |
| **Lines (applications)** | ≥1 · sales_id + amount (+ discount) · same customer · ≤ outstanding · no duplicate SI |
| **Statuses** | No progress_status · SI receipt: none/partial/full |
| **Gates** | Update/delete 409 if JE posted · optional `accounts_auto_post_or` |
| **Stock** | None |

Also entered via Receivables hub `/app/finance/receivables` (`finance.acct_ii`).

---

## Supplier Invoice — `fin_supplier_invoice`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** |
| **Header*** | invoice_date, vendor, tax, currency, location · + PIC, progress, due, terms, vendor inv#, ref, project, notes |
| **Lines** | ≥1 · qty>0 · GR/PO link or item · qty ≤ open · see `02-LINE-COLUMNS.md` |
| **Statuses** | unconfirmed → Submit → e_approval → Approve → completed · reject → unconfirmed · payment unpaid/partial/paid |
| **Gates** | No direct PATCH to e_approval · no edit while e_approval · `purchase_require_gr_before_supplier_invoice` HARD when ON |
| **Stock** | None |

---

## Payment Voucher — `/app/finance/payment-vouchers`

| | |
|--|--|
| **Kind** | transaction · draft `fin_payment_voucher` · Form Settings **No** |
| **Header*** | payment_date, vendor, currency, payment_method · bank_account UI for check |
| **Lines** | ≥1 supplier invoice application · ≤ outstanding · vendor match |
| **JE** | draft / deferred / auto-post · optional `accounts_auto_post_pv` |
| **Approval enum** | Partially observed — UNKNOWN full machine |
| **Stock** | None |

Also via Payables hub `/app/finance/payables`.

---

## Journal Entry — `/app/finance/acct-i/journal-entries`

| | |
|--|--|
| **Kind** | transaction · draft `fin_journal_entry` · Form Settings **No** |
| **Header** | entry no/date system · remarks |
| **Lines** | ≥2 · account_code* · debit XOR credit · optional dept/project |
| **Statuses** | draft → post → posted · cancelled path UNKNOWN |
| **Gates** | Must balance on post · `finance_require_je_approval` HARD when ON · posted locks SI/Sale account pickers · auto-post may downgrade if JE approval on |
| **Feature** | `finance.acct_i` via Bookkeeping `/app/finance/bookkeeping` |

---

## Chart of accounts

> Full window catalog: **`10-CHART-OF-ACCOUNTS.md`** — account form, default mappings, PH SME template.

Path: `/app/finance/acct-i/chart-of-accounts` · draft `fin_account` · no Form Settings.

---

## Hubs & related (thin)

| Screen | Path | Kind | Notes |
|--------|------|------|-------|
| Finance workspace | `/app/finance` | hub | |
| Banking | `/app/finance/banking` | hub/config | Fields UNKNOWN |
| Budgets | `/app/finance/budgets` | transaction/config | UNKNOWN |
| BIR Statutory | `/app/finance/statutory` | report/config | `finance.statutory_read` |
| Finance reports | `/app/finance/reports` | report | |
| Tax types / Currencies | `/app/quotation/tax-mngt/*` | master | Form Settings Yes — see `01` |
| Fixed assets | `/app/fixed-assets` | master/transaction | draft `fixed_asset` — fields UNKNOWN |
| Account defaults | (settings) | config | draft `fin_account_defaults` |

---

## Cross-links from other modules

| From | To |
|------|----|
| Sales / Receivables | Official Receipt |
| Purchase receive / Payables | Supplier Invoice → Payment Voucher |
| Inventory GL hybrid | may create JE when `inventory_gl_hybrid_enabled` — **verify** per tenant |
| POS auto-post | optional SI + OR |
