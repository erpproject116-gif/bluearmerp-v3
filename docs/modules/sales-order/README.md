# Sales Order module

## Scope

Commercial sales orders with release tracking and stock deduction.

| Feature | Route | API |
|---------|-------|-----|
| Sales Order List | `/app/sales-order/sales-orders` | `GET /api/v1/sales-order/sales-orders` |
| New Sales Order | `/app/sales-order/sales-orders/new` | `POST /api/v1/sales-order/sales-orders` |
| Sales Order Status | `/app/sales-order/sales-orders/status` | `GET /api/v1/sales-order/sales-orders/status-report` |
| Release Sales Order | `/app/sales-order/sales-orders/release` | `GET /api/v1/sales-order/sales-orders/release-queue`, `POST /api/v1/sales-order/sales-orders/releases` |
| Delivery Receipt List | `/app/sales-order/delivery-receipts` | `GET /api/v1/sales-order/delivery-receipts` |
| New Delivery Receipt | `/app/sales-order/delivery-receipts/new` | `POST /api/v1/sales-order/delivery-receipts`, `POST .../{id}/post` |
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

`POST /sales-orders/releases` records `so_sales_order_release_lines` and updates inventory per **Process Policies**:

| `legacy_combined_so_release` | Release behavior | DR post behavior |
|------------------------------|------------------|------------------|
| `true` (default) | Decrements `qty_on_hand` (`so_release`) | Documentary slip only |
| `false` | Increments `qty_reserved` (`so_reserve`) | Issues stock (`dr_issue`) |

See [ADR 0005](../../adr/0005-process-flows-and-policies.md).

## Delivery receipts (S9)

Golden chain: `DEMO-S9-SO` → release → `DEMO-S9-DR` (posted) → `DEMO-S9-SI`.

Open lines picker: `GET /delivery-receipts/open-lines`. Post writes `so_sales_order_slip_lines` with `slip_type = delivery_receipt`.

When split mode is off, Sales SI still validates against **released − invoiced**; when on, against **delivered − invoiced**.

## Outstanding report

Default filters: `balance_qty > 0` (order qty minus released qty) and stock at Location-Out `>= balance_qty` when `require_stock=true`.

## Manual test checklist

1. Create standalone sales order with lines via New Sales Order modal.
2. Open Sales Order List — verify Date-No, delivery date, progress, print, created slip.
3. From Quotation picker — select open quote lines, save SO — verify quotation Created Slip and voucher status.
4. Release Sales Order — release qty with sufficient stock — verify balance decreases and stock movement.
5. Delivery Receipt — create draft from released lines, post — verify slip line and (split mode) stock issue.
6. Release with insufficient stock — expect validation error, no partial transaction.
7. Sales Order Status and Outstanding S/O reports — filter, search, CSV export.
8. Form settings cog on list — `so_sales_order` entity.
9. Golden S9 verify passes after `db reset`.
10. Attachments upload (max 25 MB).

## Migrations

- `013_sales_order.sql`
- `054_stock_reservation.sql` — `qty_reserved`
- `055_delivery_receipt.sql` — `dr_*` tables, permissions

Seed: `scripts/seed-demo-sales-orders.sql` after `scripts/seed-demo-quotations.sql`.

## Shipping orders & delivery trips (status lock)

| Entity | Statuses (migration `266`) |
|--------|------------------------------|
| Shipping order | `draft` \| `confirmed` \| `shipped` \| `cancelled` |
| Delivery trip | `planned` \| `in_progress` \| `completed` \| `cancelled` |

API rejects other values (`NormalizeShippingOrderStatus` / `NormalizeDeliveryTripStatus`). Load Slip picker excludes shipping orders with status `cancelled`. Creates default to `draft` / `planned`.

Routes: `/app/sales-order/shipping/orders`, `/rules`, `/trips`

## Production

Run migrations on Supabase (session pooler URI). Redeploy API (ECS) and Vercel web after env is unchanged.
