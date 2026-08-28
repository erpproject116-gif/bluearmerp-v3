# Deep dive — Accounting (AR, AP, Journals) & form fields

**Audience:** product owner, finance, superadmin  
**Evidence:** Observed — `docs/modules/finance/README.md`, finance APIs/UI, process policies  
**Companion:** Sell/Buy deep dives for commercial docs that feed GL

---

## 1. Money map (plain language)

| Job | Documents | Hub |
|-----|-----------|-----|
| Collect from customer | Sales Invoice → **Official Receipt** (applications) | Receivables / Official Receipts (`finance.acct_ii`) |
| Pay supplier | Posted GR → **Supplier Invoice** → **Payment Voucher** | Payables / Payment Vouchers |
| Books | **Journal Entry** draft → post | Bookkeeping / Ledger (`finance.acct_i`) |
| Setup | Tax types, currencies | Taxes (`quotation.tax_mngt`) |
| Statutory / budgets | Budgets, BIR | feature-gated |

```
Customer:  SI ──► Official Receipt ──► fin_receipt_applications ──► (optional JE)
Supplier:  GR(post) ──► Supplier Invoice ──► Payment Voucher ──► fin_payment_applications
Books:     Invoice Account tab ──► draft JE ──► Post (or auto-post policies)
```

---

## 2. Screen map

| Screen | Path | Notes |
|--------|------|-------|
| Finance workspace | `/app/finance` | Owner hub |
| Official Receipts | `/app/finance/official-receipts` | New + list + settings |
| Supplier Invoices | `/app/finance/supplier-invoices` | New + list |
| Payment Vouchers | `/app/finance/payment-vouchers` | New + list |
| Receivables / Payables hubs | `/app/finance/receivables`, `/payables` | `finance.acct_ii` |
| Journal entries | under Bookkeeping / acct-i | `finance.acct_i` |
| Reports | AR/AP by party, receipt/payment status, books | |
| Banking / Budgets / BIR | `/app/finance/...` | Depth varies |

Form settings observed for: `fin_official_receipt`, `fin_supplier_invoice` (tenant can require/hide fields).

---

## 3. Official Receipt (OR) — fields & conditions

**Create:** `/app/finance/official-receipts/new`

### Header (required *)

| Field | Required | Notes |
|-------|----------|-------|
| receipt_date | * | |
| partner_id (Customer) | * | |
| currency_id | * | |
| payment_method | * | Allowed set (cash / check / bank_transfer observed in UI) |
| reference_no | Optional | |
| notes | Optional | |
| Date-No / Receipt No | System | Sequences |

### Applications (lines)

| Rule |
|------|
| ≥1 application |
| Each: `sales_id` + applied amount (+ optional discount) |
| Applied + discount > 0 |
| No duplicate sales on one OR |
| Sale must match customer |
| Cannot exceed outstanding on SI |

### Lifecycle

- OR header has **no** `progress_status` — create saves applications immediately.
- Update/delete blocked (**409**) when a GL journal for that OR is already **posted**.
- Collection report status on SI: `none` / `partial` / `full` (from applications).
- Optional auto JE: `accounts_auto_post_or`.

**Does not** create stock movements.

---

## 4. Supplier Invoice — fields, status, gates

**Create:** `/app/finance/supplier-invoices/new`

### Header

| Field | Required |
|-------|----------|
| invoice_date | Yes |
| partner_id (Vendor) | Yes |
| tax_type_id / transaction type | Yes |
| currency_id | Yes |
| location_id | Yes |
| PIC, due date, payment terms, vendor invoice no., reference, project, notes | Optional |
| progress_status | System — starts `unconfirmed` |

### Lines

| Rule |
|------|
| ≥1 line; qty > 0; line total > 0 |
| May link `goods_receipt_line_id` and/or `purchase_order_line_id` |
| If no source slip → `item_id` required |
| Qty ≤ GR / PO open balance |
| Vendor must match; no duplicate GR/PO lines |
| Optional: serials / lots / withholding / custom fields |

### Lifecycle (real approval)

```
unconfirmed --Submit--> e_approval --Approve--> completed
                e_approval --Reject(+remarks)--> unconfirmed
```

| Rule | Detail |
|------|--------|
| Direct PATCH to e_approval | **Blocked** — use Submit |
| Edit while e_approval | **Blocked** |
| Approve permission | `finance.supplier_invoices_approve` |
| Payment status (derived) | unpaid / partial / paid |

### Policy gate

`purchase_require_gr_before_supplier_invoice` **ON** → lines need **posted GR** balance (**Hard**).

**Does not** move stock on SI save — stock moved on GR post.

---

## 5. Payment Voucher (PV) — fields & conditions

**Create:** `/app/finance/payment-vouchers/new`

### Header

| Field | Required |
|-------|----------|
| payment_date | Yes |
| partner_id (Vendor) | Yes |
| currency_id | Yes |
| payment_method | Yes |
| reference_no | Optional |
| bank_account_id | UI when method = check; API optional |
| Notes / WHT lines | Optional |

### Applications

| Rule |
|------|
| ≥1 `supplier_invoice_id` + applied (+ discount) |
| Vendor must match invoice |
| Cannot over-apply outstanding |
| Discount may need AP discount account |

### Lifecycle

- Create saves applications; JE may be draft, deferred if over approval threshold, or auto-post via `accounts_auto_post_pv`.
- Full PV approval enum: partially observed — treat JE/posting as SoT for “posted money.”

**Does not** create stock movements.

---

## 6. Journal Entry — fields & post gates

**Screen:** Finance → Bookkeeping / Journal entries

### Header

| Field | Notes |
|-------|-------|
| Entry no / date | System on create |
| Remarks | Optional |

### Lines (≥2)

| Field | Required |
|-------|----------|
| account_code | Yes — must resolve |
| debit / credit | Balanced on post |
| dept_id / project_id | Optional |

### Lifecycle

`draft` → **Post** → `posted`  
(List may show `cancelled` — exact cancel path: **UNKNOWN**)

### Gates

| Gate | Rule |
|------|------|
| ≥2 lines on create | Hard |
| Debits = credits on post | Hard |
| `finance_require_je_approval` ON | **Hard** — approval before post |
| Posted JE | Locks invoice account pickers on SI/Sale Invoice tab |
| Auto-post | `accounts_auto_post_sales` / `purchase` / `or` / `pv` — downgraded if JE approval required |

### Where draft JEs come from

Sale or Supplier Invoice → **Invoice** tab → save accounts → `invoicejournal.Sync` creates/refreshes **draft** JE.

---

## 7. Reports (collection truth)

| Report | Status language |
|--------|-----------------|
| SI Receipt Status | none / partial / full |
| Supplier Payment Status | none / partial / full |
| Official Receipt Status | OR list; opens receipt journal |
| A/R by Customer / A/P by Vendor | Balances |
| Customer/Vendor Book | Running balance by date range |

---

## 8. Cross-links to Sell / Buy / Stock

| Upstream | Accounting effect |
|----------|-------------------|
| Completed Sales Invoice | Collectible; optional draft/auto JE |
| Official Receipt | Applies cash to SI |
| Posted Goods Receipt | Enables AP bill lines (when policy on) |
| Supplier Invoice completed | Payable |
| Payment Voucher | Applies cash to SI (AP) |
| Stock Entry / Adjustment | Qty only — GL only if inventory GL hybrid / separate config (**verify tenant**) |

---

## 9. Compare to your finance ops

| Your question | Where |
|---------------|-------|
| How do we record customer payment? | Official Receipt + applications |
| How do we bill the supplier after receive? | Supplier Invoice vs posted GR |
| Who must approve supplier bills? | Submit → Approve (`finance.supplier_invoices_approve`) |
| When does the GL lock? | JE **posted** |
| Can we skip GR before bill? | Only if GR-before-bill policy **off** |
