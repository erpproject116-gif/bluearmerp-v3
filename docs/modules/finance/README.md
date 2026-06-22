# Finance module

Official receipts (OR) applied against Sales invoices (SI). Tracks customer collections and A/R balances.

## Features (MVP)

| Feature | Web route | API |
|---------|-----------|-----|
| New Official Receipt | `/app/finance/official-receipts/new` | `POST /api/v1/finance/official-receipts` |
| Official Receipt List | `/app/finance/official-receipts` | `GET /api/v1/finance/official-receipts` |
| A/R by Customer | `/app/finance/reports/ar-by-customer` | `GET /api/v1/finance/ar-by-customer` |
| Receipt Status | `/app/finance/reports/receipt-status` | `GET /api/v1/finance/receipt-status` |
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

- **A/R by Customer** — per customer: total sales, total received, balance.
- **Receipt Status** — line-level sales with receipt status `none` / `partial` / `full` (Sales Phase 2b foundation).

Both reports support CSV export.

## Manual test checklist

1. Create OR against a completed sale — applications saved, `amount_total` matches sum.
2. Second OR on same sale — validation blocks over-application.
3. Official Receipt List — search, payment method filter, edit modal.
4. A/R by Customer report + CSV export.
5. Receipt Status report shows `full` after demo seed OR.
6. Activity log entry on OR create (`finance.receipt.create`).

## Migrations

- `017_finance.sql` — `fin_official_receipts`, `fin_receipt_applications`, module registry

## Seeds

Run after `seed-demo-sales.sql`:

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-finance.sql
```

Creates one full-payment OR (`YYMMDD301`) applied to the demo sale (`YYMMDD201`).
