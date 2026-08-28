# Module — Accounting (Finance) & Fixed Assets

> **Deep dive:** `16-DEEP-ACCOUNTING-FORMS.md` (OR / SI / PV / JE fields & gates)

## Accounting overview (`finance`)

**Path:** `/app/finance`  
**Purpose:** Customer collections, supplier payments, books, banking, budgets, statutory.

### Feature groups

| Group | Paths / notes | featureCode |
|-------|---------------|-------------|
| Workspace | `/app/finance` | |
| Bookkeeping / Ledger | `/app/finance/bookkeeping`, acct-i journal entries | `finance.acct_i` |
| Receivables | `/app/finance/receivables` | `finance.acct_ii` |
| Payables | `/app/finance/payables` | `finance.acct_ii` |
| Banking | `/app/finance/banking` | |
| Reports | `/app/finance/reports` | |
| Official receipts | `/app/finance/official-receipts` | |
| Payment vouchers | `/app/finance/payment-vouchers` | also sub-branch `finance.payment_vouchers` |
| Budgets | `/app/finance/budgets` | |
| BIR Statutory | `/app/finance/statutory` | `finance.statutory_read` |
| Taxes sub-branch | `/app/quotation/tax-mngt/tax-types` | `quotation.tax_mngt` |
| Cross-links | Payroll, Remittances, Assets | HR / Fixed Assets screens |

### Money flows (plain)

**Customer:** Sales invoice → Official Receipt → applications (`none` / `partial` / `full` on reports)  
**Supplier:** Posted Goods Receipt → Supplier Invoice → Payment Voucher → applications  
**Books:** Journal Entry `draft` → `posted` (optional JE approval). Posted JE locks invoice account pickers (**docs**).

### Happy paths

1. **Collect:** open Receipts or Receivables → apply to open SI.  
2. **Pay:** open Vouchers or Payables → apply to supplier invoices.  
3. **Post books:** Bookkeeping → balanced draft JE → post.  
4. **Tax setup:** Taxes sub-branch → tax types / currencies (also used by quotations).

### Gates

- Foundation / module feature codes hide ledger and AR/AP hubs.
- Supplier invoice qty ≤ GR balance when GR-before-bill policy on.
- JE post: balanced; `finance.journal_entries_post`; optional `finance_require_je_approval` (**enforced**).
- Auto-post flags for sales/purchase/OR/PV — downgraded if JE approval required.

### Official Receipt lifecycle (G-10 narrowed)

**Observed:** `official_receipts.go`, `posting_events.go` `blockIfPosted`

- OR header has **no** `progress_status` field.
- Create: date, partner, currency, payment method, applications to sales invoices (`finance.official_receipts_new`).
- Update/delete applications and header: blocked with 409 when a GL journal is already **posted** for that OR.
- Journal path: optional auto-post (`accounts_auto_post_or`) or Receipt Journal UI; journal save can report status `posted`.
- Collection reports: SI receipt status `none` / `partial` / `full` (computed from applications, not an OR header enum).

### UNKNOWN (remaining)

- Full BIR form coverage beyond nav labels

### Supplier invoice / Purchase Receive approval (G-11 closed)

**Observed:** `supplier_invoice_approval.go`, migration `131` (`progress_status in unconfirmed|e_approval|completed`)

```
unconfirmed --submit-for-approval--> e_approval --approve--> completed
                 e_approval --reject(+remarks)--> unconfirmed
```

| Step | API | Who |
|------|-----|-----|
| Submit | `POST .../supplier-invoices/{id}/submit-for-approval` | `finance.supplier_invoices` write |
| Approve / Reject | `POST .../approve` · `.../reject` | `finance.supplier_invoices_approve` write |
| Direct PATCH to `e_approval` | Blocked — “Use Submit for approval” | — |
| Edit while `e_approval` | Blocked | — |

Also: attachment policy may block submit; approval queue outbox drained on submit (`approval.EnqueuePendingApprovalTx`).

### Evidence

`docs/modules/finance/README.md`, ADR 0005 (amended), `api/internal/modules/finance/`

## Fixed Assets (`fixed_assets`)

**Path:** `/app/fixed-assets`  
**Purpose:** Asset register.  
Also linked from Finance workspace.

### Status / depth

Register exists. Multi-book depreciation depth called out as roadmap in help — **do not claim complete** (gap P3).

### Evidence

`modules.ts`; help roadmap; `api/internal/modules/fixedassets/`
