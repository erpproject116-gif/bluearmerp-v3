# Sales Order module

## Scope

Commercial sales orders with release tracking and stock deduction.

| Feature | Route | API |
|---------|-------|-----|
| Sales Order List | `/app/sales-order/sales-orders` | `GET /api/v1/sales-order/sales-orders` |
| New Sales Order | `/app/sales-order/sales-orders/new` | `POST /api/v1/sales-order/sales-orders` |
| Sales Order Status | `/app/sales-order/sales-orders/status` | `GET /api/v1/sales-order/sales-orders/status-report` |
| Release Sales Order | `/app/sales-order/sales-orders/release` | `GET /api/v1/sales-order/sales-orders/release-queue`, `POST /api/v1/sales-order/sales-orders/releases` |
| Outstanding S/O Status | `/app/sales-order/sales-orders/outstanding` | `GET /api/v1/sales-order/sales-orders/outstanding-report` |
| Print | new tab from grid | `GET /api/v1/sales-order/sales-orders/{id}/print` |
| Form settings | `/sales-order/sales-orders/settings` | `so_sales_order` entity |

## Dependencies

- **Inventory** — partners, items, locations, stock balances
- **Quotation / Tax Management** — `quo_tax_types`, `quo_currencies`
- **Quotation conversion** — writes `quo_quotation_slip_lines` and updates `voucher_status`

## Sequences

- Date-No.: `MM/DD/YYYY-N` via `sales_order_date_seq`
- Sales Order No.: `YYMMDD###` via `sales_order_no`

## Demo seed (sales orders)

- Base: `scripts/seed-demo-sales-orders.sql` (2 demo SO per tenant)
- Optional BLUEARM list export: `scripts/seed-demo-sales-orders-export.sql` — generate via `scripts/generate-sales-order-seed-from-export.py path/to/sales-order-list.xlsx`
- Customers match existing `inv_partners` by `company_name` first; new export-only customers use `S0001`–`S9999` codes
- Fixture sample (from screenshots): `scripts/fixtures/sales-order-list-export.xlsx`

## Release and stock

`POST /sales-orders/releases` records `so_sales_order_release_lines` and, when `track_inventory_qty` is true, decrements `inv_item_location_balances` and inserts `inv_stock_movements` (`movement_type = so_release`) in one transaction.

## Outstanding report

Default filters: `balance_qty > 0` (order qty minus released qty) and stock at Location-Out `>= balance_qty` when `require_stock=true`.

## Manual test checklist

1. Create standalone sales order with lines via New Sales Order modal.
2. Open Sales Order List — verify Date-No, delivery date, progress, print, created slip.
3. From Quotation picker — select open quote lines, save SO — verify quotation Created Slip and voucher status.
4. Release Sales Order — release qty with sufficient stock — verify balance decreases and stock movement.
5. Release with insufficient stock — expect validation error, no partial transaction.
6. Sales Order Status and Outstanding S/O reports — filter, search, CSV export.
7. Form settings cog on list — `so_sales_order` entity.
8. Attachments upload (max 25 MB).

## Migrations

`013_sales_order.sql`

Seed: `scripts/seed-demo-sales-orders.sql` after `scripts/seed-demo-quotations.sql`.

## Production

Run migration `013` on Render Postgres (Session pooler URI). Redeploy API and Vercel web after env is unchanged.
