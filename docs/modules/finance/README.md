# Finance module

Official receipts (OR) applied against Sales invoices (SI). Supplier invoices and payment vouchers applied against posted goods receipts. Tracks customer collections (A/R) and vendor payables (A/P).

## Features (MVP)

| Feature | Web route | API |
|---------|-----------|-----|
| New Official Receipt | `/app/finance/official-receipts/new` | `POST /api/v1/finance/official-receipts` |
| Official Receipt List | `/app/finance/official-receipts` | `GET /api/v1/finance/official-receipts` |
| New Supplier Invoice | `/app/finance/supplier-invoices/new` | `POST /api/v1/finance/supplier-invoices` |
| Supplier Invoice List | `/app/finance/supplier-invoices` | `GET /api/v1/finance/supplier-invoices` |
| New Payment Voucher | `/app/finance/payment-vouchers/new` | `POST /api/v1/finance/payment-vouchers` |
| Payment Voucher List | `/app/finance/payment-vouchers` | `GET /api/v1/finance/payment-vouchers` |
| A/R by Customer | `/app/finance/reports/ar-by-customer` | `GET /api/v1/finance/ar-by-customer` |
| A/P by Vendor | `/app/finance/reports/ap-by-vendor` | `GET /api/v1/finance/ap-by-vendor` |
| Customer/Vendor Book I (AR) | `/app/finance/reports/customer-vendor-book-ar` | `GET /api/v1/finance/customer-vendor-book?book_type=ar` |
| Customer/Vendor Book I (AP) | `/app/finance/reports/customer-vendor-book-ap` | `GET /api/v1/finance/customer-vendor-book?book_type=ap` |
| SI Receipt Status | `/app/finance/reports/receipt-status` | `GET /api/v1/finance/receipt-status` |
| Supplier Payment Status | `/app/finance/reports/supplier-payment-status` | `GET /api/v1/finance/supplier-payment-status` |
| Official Receipt Status | `/app/finance/reports/official-receipt-status` | `GET /api/v1/finance/official-receipt-status` |
| Form settings | `/app/finance/official-receipts/settings` | `fin_official_receipt` entity |

## Commercial flows

**Accounts receivable**

```
Sales (SI) → Official Receipt (OR) → fin_receipt_applications
```

**Accounts payable**

```
Goods Receipt (posted) → Supplier Invoice → fin_supplier_invoice_lines + gr_goods_receipt_slip_lines
Supplier Invoice → Payment Voucher → fin_payment_applications
```

- Each OR applies one or more amounts to `sa_sales` rows.
- Each supplier invoice line references a posted GR line; billed qty cannot exceed GR balance.
- Each payment voucher applies one or more amounts to `fin_supplier_invoices` rows.
- Process policy `purchase_require_gr_before_supplier_invoice` (default off) can require GR before AP entry.

## Sequences

**Official receipts**

- Date-No.: `MM/DD/YYYY-N` via `fin_receipt_date_seq`
- Receipt No.: `YYMMDD###` via `fin_receipt_no`

**Supplier invoices**

- Date-No.: `MM/DD/YYYY-N` via `fin_supplier_invoice_date_seq`
- Invoice No.: `YYMMDD###` via `fin_supplier_invoice_no`

**Payment vouchers**

- Date-No.: `MM/DD/YYYY-N` via `fin_payment_voucher_date_seq`
- Payment No.: `YYMMDD###` via `fin_payment_voucher_no`

## Reports

- **SI Receipt Status** — line-level sales with receipt status `none` / `partial` / `full`.
- **Supplier Payment Status** — supplier invoices with paid/balance and status `none` / `partial` / `full`.
- **A/R by Customer** — customer balances with optional filters.
- **A/P by Vendor** — vendor billed/paid/balance totals.
- **Customer/Vendor Book I (AR/AP)** — slip-level debit/credit book with running balance for a date range.
- **Official Receipt Status** — OR header list; opens Receipt Journal on Date-No.

## Manual test checklist

1. Create OR against a completed sale — applications saved, `amount_total` matches sum.
2. Create supplier invoice against open GR lines — slip lines written, GR balance reduced.
3. Create payment voucher with partial application — balance remains on supplier invoice.
4. A/P by Vendor and Supplier Payment Status reports show demo S8 data after seed.
5. A/R by Customer report + CSV export.
6. Process policies page — toggle purchase/sales gates (defaults are skip-friendly).
7. Reconciliation: `GET /inventory/reconciliation/gr-without-supplier-invoice` lists unbilled GR after S3 receive.
8. Reconciliation: `GET /inventory/reconciliation/ap-over-application` should be empty on demo data.

## Journal entry workflow (draft → post)

Sales and supplier invoices sync a **draft** journal when you save invoice accounts on the **Invoice** tab (`PUT .../invoice` → `invoicejournal.Sync`).

| Step | Where | What happens |
|------|--------|----------------|
| Configure accounts | Sale or supplier invoice → **Invoice** tab | Acct I/II, fees, remark saved |
| Draft JE | Finance → Journal entries | DR/CR lines created or refreshed while status = `draft` |
| Review / approve | Journal entry detail | Optional when `journal_require_approval` is enabled in process policies |
| Post | Journal entry → Post | Status → `posted`; TB / financial statements include amounts |
| Auto-post | Settings → Process policies | `accounts_auto_post_sales`, `accounts_auto_post_purchase`, `accounts_auto_post_or`, `accounts_auto_post_pv` |

**Posted JE lock:** Once posted, invoice account pickers are read-only; change GL via journal entries or reversing entries.

**Month-end:** See [`docs/runbooks/month-close-checklist.md`](../../runbooks/month-close-checklist.md).

## Migrations

- `017_finance.sql` — `fin_official_receipts`, `fin_receipt_applications`, module registry
- `028_finance_receipt_journal.sql` — receipt journal, bank accounts, GL, attachments
- `029_sales_collections_permissions.sql` — sales collection report permissions
- `052_finance_ap.sql` — supplier invoices, payment vouchers, AP reports permissions

## Seeds

Run after `seed-demo-golden-scenarios.sql`:

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-finance.sql
psql "$DATABASE_URL" -f scripts/seed-demo-finance-ap.sql
```

- `seed-demo-finance.sql` — full-payment OR (`YYMMDD301`) applied to demo sale (`YYMMDD201`).
- `seed-demo-finance-ap.sql` — S8 chain: supplier invoice `DEMO-S8-AP` against S3 GR, partial payment `DEMO-S8-PV` (₱30,000 of ₱50,000).
