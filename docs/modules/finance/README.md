# Finance module

Official receipts (OR) applied against Sales invoices (SI). Tracks customer collections and A/R balances.

## Features (MVP)

| Feature | Web route | API |
|---------|-----------|-----|
| New Official Receipt | `/app/finance/official-receipts/new` | `POST /api/v1/finance/official-receipts` |
| Official Receipt List | `/app/finance/official-receipts` | `GET /api/v1/finance/official-receipts` |
| A/R by Customer | `/app/finance/reports/ar-by-customer` | `GET /api/v1/finance/ar-by-customer` |
| SI Receipt Status | `/app/finance/reports/receipt-status` | `GET /api/v1/finance/receipt-status` |
| Official Receipt Status | `/app/finance/reports/official-receipt-status` | `GET /api/v1/finance/official-receipt-status` |
| Form settings | `/app/finance/official-receipts/settings` | `fin_official_receipt` entity |

## Commercial flow

```
Sales (SI) → Official Receipt (OR) → fin_receipt_applications
```

- Each OR applies one or more amounts to `sa_sales` rows.
- `applied_amount` cannot exceed sale `grand_total` minus existing applications.
- `amount_total` on the OR header equals the sum of application lines.

## Sequences

- Date-No.: `MM/DD/YYYY-N` via `fin_receipt_date_seq`
- Receipt No.: `YYMMDD###` via `fin_receipt_no`

## Reports

- **SI Receipt Status** — line-level sales with receipt status `none` / `partial` / `full`.
- **Official Receipt Status** — OR header list with customer, amount, remark; opens Receipt Journal on Date-No.
- **Receipt Journal** — journal lines, bank accounts, GL picklist, receivable applications, attachments (`028` schema).

Both SI and Official Receipt Status reports support CSV export. A/R by Customer supports optional location, department, project, and PIC filters.

## Manual test checklist

1. Create OR against a completed sale — applications saved, `amount_total` matches sum.
2. Second OR on same sale — validation blocks over-application.
3. Official Receipt List — search, payment method filter, edit modal.
4. A/R by Customer report + CSV export.
5. SI Receipt Status report shows `full` after demo seed OR.
6. Official Receipt Status lists demo OR; journal shows bank line after seed.
7. Activity log entries on OR create (`finance.receipt.create`) and journal save (`finance.receipt.journal.update`).

## Migrations

- `017_finance.sql` — `fin_official_receipts`, `fin_receipt_applications`, module registry
- `028_finance_receipt_journal.sql` — receipt journal, bank accounts, GL, attachments
- `029_sales_collections_permissions.sql` — sales collection report permissions

## Seeds

Run after `seed-demo-sales.sql`:

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-finance.sql
```

Creates one full-payment OR (`YYMMDD301`) applied to the demo sale (`YYMMDD201`).
