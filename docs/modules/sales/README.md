# Sales module

Commercial sales invoices (SI) converted from released Sales Order lines. **Sales does not deduct stock** — SO Release is the only outbound stock movement.

## Features (MVP)

| Feature | Web route | API |
|---------|-----------|-----|
| New Sales | `/app/sales/sales/new` | `POST /api/v1/sales` |
| Sales List | `/app/sales/sales` | `GET /api/v1/sales` |
| Sales Status | `/app/sales/sales/status` | `GET /api/v1/sales/status-report` |
| Pre-invoicing Status | `/app/sales/sales/pre-invoicing` | `GET /api/v1/sales/pre-invoicing-report` |
| Packing Slip Print | `/app/sales/sales/:id/print` | `GET /api/v1/sales/{id}/print` |
| Form settings | `/app/sales/sales/settings` | `sa_sales` entity |

## Phase 2 features

| Feature | Web route | API |
|---------|-----------|-----|
| Change Sales Price-Batch | `/app/sales/sales/price-batch` | `GET/PATCH /api/v1/sales/price-batch/lines` |

## Templates

| Tab | `template_code` | Line grid |
|-----|-----------------|-----------|
| Default | `default` | Item, Qty, Non-Vat, Non-Vat Total, Vat-Inc., Tax, Remark, Serial/Lot |
| Non-VAT | `non_vat` | + Discount, Discounted Price Vat Ex./Inc. |
| VAT Included | `vat_included` | Same discount columns as Non-VAT |

## Commercial flow

```
Quotation → Sales Order → SO Release (stock) → Sales (SI)
```

- Picker balance: `released_qty − sum(so_sales_order_slip_lines.qty)` per SO line.
- On create, writes `so_sales_order_slip_lines` and recomputes `so_sales_orders.fulfillment_status`.

## Sequences

- Date-No.: `MM/DD/YYYY-N` via `sales_date_seq`
- Sales No.: `YYMMDD###` via `sales_no`

## Manual test checklist

1. Release SO line (stock decreases).
2. New Sales from SO picker — balance respected, slip lines written, SO fulfillment updated.
3. Sales List columns + invoicing ✓/✗ toggle.
4. Packing slip print — resize columns, then print.
5. Sales Status + Pre-invoicing reports + CSV export.
6. Create sale on each template tab — correct columns and tax preview.
7. Activity log entry on sales create/update (`sales.create`, `sales.update`).
8. Autosave banner on New Sales — Apply / Delete draft.
9. Price-Batch: filter → grid → edit Non-Vat → save; Date-No opens full modal.

## Migrations

- `014_sales.sql` — `sa_*` tables, `so_sales_order_slip_lines`, module registry
- `015_document_drafts.sql` — autosave

## Seeds

Run after `seed-demo-sales-orders.sql`:

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-sales.sql
```
