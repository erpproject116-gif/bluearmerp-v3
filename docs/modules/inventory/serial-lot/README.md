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

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/inventory/serial-units` | Registry list |
| `GET /api/v1/inventory/serial-units/trace?serial_no=` | Trace lookup |
| `GET /api/v1/inventory/serial-units/available?item_id=` | Pick list for sales/release |
| `POST /api/v1/inventory/serial-units/transfer` | Internal location transfer |
| `GET /api/v1/purchase-order/purchase-orders` | PO list |
| `POST /api/v1/purchase-order/purchase-orders/from-purchase-request/{id}` | Create PO from PR |
| `PATCH /api/v1/purchase-order/purchase-orders/{id}/confirm` | Confirm PO + PR slip lines |
| `POST /api/v1/goods-receipt/goods-receipts` | Draft receipt from PO |
| `POST /api/v1/goods-receipt/goods-receipts/{id}/serials` | Scan serial |
| `POST /api/v1/goods-receipt/goods-receipts/{id}/post` | Post receipt |

## Migrations

- `040_serial_lot.sql` — tables + item flags
- `041_serial_lot_permissions.sql`
- `042_purchase_order.sql` / `043_purchase_order_permissions.sql`
- `044_goods_receipt.sql`
- `046_crm_serial_warranty.sql`

## Demo data

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-purchase-requests.sql
psql "$DATABASE_URL" -f scripts/seed-demo-serial-lot.sql
```

## Legacy backfill (optional)

```bash
psql "$DATABASE_URL" -f scripts/backfill-serial-units-from-sales.sql
```

## Verification checklist

1. `go build ./...` and `npm run build`
2. PR → PO → confirm → Receive scan → registry `in_stock`
3. Duplicate serial rejected on post
4. SO release requires serial pick for tracked items
5. Sales marks serial `sold`; CRM warranty asset has `serial_unit_id`
6. Trace shows PR → PO → GRN chain
7. Warranty alert job creates notifications at 90/30/7/0 day rules
