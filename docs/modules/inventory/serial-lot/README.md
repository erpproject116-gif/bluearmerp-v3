# Serial & Lot (Inventory sub-branch)

Ledger-backed serial tracking from purchase through sales, with CRM warranty integration.

## Navigation

Inventory sidebar → **Serial & Lot** → header tabs:

| Tab | Route | Permission |
|-----|-------|------------|
| Serial Registry | `/app/inventory/serial-lot/registry` | `inventory.serial_registry` |
| Lot Batches | `/app/inventory/serial-lot/lots` | `inventory.serial_registry` |
| Serial Movements | `/app/inventory/serial-lot/movements` | `inventory.serial_movements` |
| Serial Trace | `/app/inventory/serial-lot/trace` | `inventory.serial_trace` |
| Receive / Scan | `/app/inventory/serial-lot/receive` | `inventory.serial_receive` |
| Settings | `/app/inventory/serial-lot/settings` | `inventory.serial_settings` |

## Document chain

```
Purchase Request → Purchase Order → Goods Receipt (scan) → Serial Registry → SO Release → Sales → CRM Warranty
```

## Item master

On **Inventory → Items**, enable **Track serial** or **Track lot** (mutually exclusive). Serial-tracked items require scan-on-receive and serial pick on sales.

## Hybrid stock policy

| Path | Qty movement | Serial |
|------|--------------|--------|
| GR post | `qty_on_hand` + | `in_stock` |
| SO Release | `qty_on_hand` − | `reserved` (+ `reserved_at`) |
| Sales from SO line | None (release already deducted) | `sold`; sold qty ≤ released |
| Direct sales | `qty_on_hand` − at invoice | `sold` when picked |

Sales update/delete reverses direct-sale stock and serial state. SO-linked lines validate against `so_sales_order_release_lines` totals.

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/inventory/serial-units` | Registry list |
| `GET /api/v1/inventory/serial-units/trace?serial_no=` | Trace lookup |
| `GET /api/v1/inventory/serial-units/available?item_id=` | Pick list for sales/release |
| `POST /api/v1/inventory/serial-units/transfer` | Internal location transfer |
| `GET /api/v1/inventory/reconciliation/serial-qty` | Qty vs serial count mismatches |
| `GET /api/v1/inventory/reconciliation/reserved-stale?days=30` | Stale reserved serials |
| `GET /api/v1/inventory/reconciliation/so-release-gap` | SO lines with unreleased order qty |
| `GET /api/v1/inventory/reconciliation/reserve-without-dr` | Released qty not yet delivered |
| `GET /api/v1/inventory/reconciliation/dr-without-invoice` | Delivered qty not yet invoiced |
| `GET /api/v1/inventory/reconciliation/gr-without-supplier-invoice` | Posted GR not fully billed |
| `GET /api/v1/inventory/reconciliation/ap-over-application` | Payments exceed supplier invoice |
| `GET /api/v1/inventory/reconciliation/gr-serial-gap?goods_receipt_id=` | Draft GR lines where received qty ≠ serial count |
| `GET /api/v1/purchase-order/purchase-orders` | PO list |
| `POST /api/v1/purchase-order/purchase-orders/from-purchase-request/{id}` | Create PO from PR |
| `PATCH /api/v1/purchase-order/purchase-orders/{id}/confirm` | Confirm PO + PR slip lines |
| `POST /api/v1/goods-receipt/goods-receipts` | Draft receipt from PO |
| `POST /api/v1/goods-receipt/goods-receipts/{id}/serials` | Scan one serial (draft) |
| `POST /api/v1/goods-receipt/goods-receipts/{id}/serials/batch` | Batch scan (max 100 per request; idempotent via `client_scan_id`) |
| `DELETE /api/v1/goods-receipt/goods-receipts/{id}/serials/{serialId}` | Remove draft serial (undo) |
| `POST /api/v1/goods-receipt/goods-receipts/{id}/lots` | Lot batch entry (track_lot) |
| `POST /api/v1/goods-receipt/goods-receipts/{id}/post` | Post receipt (+ CRM warranty at receipt) |
| `POST /api/v1/goods-receipt/goods-receipts/{id}/reverse` | Reverse posted GR (permission gated) |
| `POST /api/v1/sales-order/releases/{releaseLineId}/undo` | Undo release, restore qty/serials |
| `POST /api/v1/sales/{id}/return-lines` | Return direct-sale lines |

Item master update blocks disabling `track_serial` / `track_lot` when open units or lot batches exist.

## UI

- **SerialPickModal** — explicit serial selection on SO Release and Sales (replaces auto-first-N pick)
- **Receive / Scan** — serial scan + lot entry for `track_lot` lines
- **Purchase Request → PO** — `PurchaseOrderModal`, goods receipt list, deep link to receive

Red flags from reconciliation appear on [Business Dashboard](../../dashboard/README.md).

## Receive / Scan UI

- Client scan queue with `sessionStorage` backup (debounced batch flush to `/serials/batch`)
- Pre-post review table: expected vs received vs serial count per line
- Single-line mode when PO has one serial-tracked line
- Undo last serial; paste serial list (one per line)
- Post blocked until all serial lines are complete

## Migrations

- `040_serial_lot.sql` — tables + item flags
- `041_serial_lot_permissions.sql`
- `042_purchase_order.sql` / `043_purchase_order_permissions.sql`
- `044_goods_receipt.sql`
- `046_crm_serial_warranty.sql`
- `047_sales_stock_hybrid.sql` — `reserved_at`, reversal permissions
- `048_gr_lots_sales_lot_batch.sql` — GR line lots, `sa_sales_lines.lot_batch_id`
- `049_dashboard.sql` — Business Dashboard module (see dashboard README)
- `050_gr_serial_scan_batch.sql` — `client_scan_id` on draft serials

## Demo data

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-purchase-requests.sql
psql "$DATABASE_URL" -f scripts/seed-demo-serial-lot.sql
psql "$DATABASE_URL" -f scripts/seed-demo-po-gr-open.sql
psql "$DATABASE_URL" -f scripts/seed-demo-dashboard.sql
```

For serial receive testing, pick purchase order **DEMOGR902** (5 units open) on Receive / Scan after running `seed-demo-po-gr-open.sql`.

## Legacy backfill (optional)

```bash
psql "$DATABASE_URL" -f scripts/backfill-serial-units-from-sales.sql
```

## Verification checklist

1. `go build ./...` and `npm run build`
2. PR → PO → confirm → Receive scan → registry `in_stock`
3. Duplicate serial rejected on post
4. SO release requires serial pick for tracked items (`SerialPickModal`)
5. Sales marks serial `sold`; CRM warranty asset has `serial_unit_id`
6. Trace shows PR → PO → GRN chain
7. Warranty alert job creates notifications at 90/30/7/0 day rules
8. **Hybrid:** direct sale deducts balance; SO-linked sale blocked when qty > released
9. **Reconciliation:** `GET /inventory/reconciliation/serial-qty` flags demo mismatch after `seed-demo-dashboard.sql`
10. **Reversals:** release undo restores qty; GR reverse blocked when serials sold
11. **Lot:** GR lot entry + sales `lot_batch_id` decrements batch qty
12. **Dashboard:** red flags panel shows serial mismatch and open PO categories
