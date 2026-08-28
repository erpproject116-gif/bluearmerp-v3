# Perishable & catch-weight inventory

Phase 1 adds opt-in perishable lot workflows on top of existing serial/lot tracking (golden S2/S3 unchanged by default).

## Item master (lot items)

| Field | Purpose |
|-------|---------|
| `catch_weight` | Decimal kg qty on GR/sales lines; requires `track_lot` |
| `default_shelf_life_days` | Auto-compute lot expiry on receive when not supplied |
| `lot_allocation_method` | `manual` (default), `fefo`, or `fifo` |
| `price_basis` | `unit` or `per_kg` (display/pricing helper) |

## Inbound — Receive station

Route: **Inventory → Serial & Lot → Receive station** (`/app/inventory/serial-lot/receive-station`)

- Serial lines use the existing batch scan queue (`POST .../serials/batch`).
- Lot/catch-weight lines use **lot batch queue** (`POST .../lots/batch`) with idempotent `client_scan_id`.
- Manual weight entry in Phase 1; USB scale deferred to Phase 4 (`web/src/shared/scale/scaleDriver.ts` stub).
- **Print label** opens PDF: `GET /api/v1/inventory/labels/container?lot_batch_id=`.

## Outbound — FEFO / FIFO

Central allocator: `api/internal/modules/inventory/lot_allocation.go`

- Used when posting sales if line has no `lot_batch_id` and item/tenant policy is `fefo` or `fifo`.
- Tenant defaults: **Process policies → Perishables / warehouse fast** preset sets FEFO + block expired sales.
- Multi-lot splits stored in `sa_sales_line_lot_allocations`.

## Expiry ops

- Lot list default sort: expiry ascending; filter `expires_in_days`.
- Reconciliation categories: **Expired lots with quantity**, **Lots expiring soon**.

## Golden demo S13

`scripts/seed-demo-golden-s13-perishable.sql` — PR→PO→GR (two weighed lots) → FEFO direct SI → verify in `verify-demo-full-chain.sql`.

## Later phases

| Phase | Scope |
|-------|--------|
| 2 | Containers, pack sessions, pack station UI |
| 3 | Disassembly BOM, WO actual input kg / lot |
| 4 | Scale driver, ZPL stub, pick wave by delivery date |

See `06-GAP-REGISTER.md` for closed vs remaining WMS gaps.
