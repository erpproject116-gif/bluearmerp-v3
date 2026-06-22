# Inventory module (MVP)

## Scope

Master data only — no stock transactions.

| Entity | Table | Route |
|--------|-------|-------|
| Partners | `inv_partners` | `/app/inventory/partners` |
| Locations | `inv_locations` | `/app/inventory/locations` |
| Projects | `inv_projects` | `/app/inventory/projects` |
| Departments | `inv_departments` | `/app/inventory/departments` |
| Items | `inv_items` | `/app/inventory/items` |

## API

Base path: `/api/v1/inventory/{entity}`

- `GET` list — `page`, `pageSize`, `sort`, `order`, `q`, `status`
- `GET` `next-code` — preview only (allocate on INSERT)
- `POST` create
- `PATCH /{id}` update
- `DELETE /{id}` soft delete

Items only (`/app/inventory/items`):

- `GET /items/import-template` — CSV template (header + sample row; codes auto-allocated on import)
- `POST /items/import` — multipart `file` CSV bulk create (max 500 rows)

## Items bulk CSV import

On the Items list: **Download template** → fill rows → **Import CSV**.

Template columns: `item_name`, `purchase_price`, `sales_price`, `vip_price`, `status`.

Codes are assigned on insert (same as **+ New row**). Partial success: valid rows are created; failures return `row_errors` with row numbers.

## Codes

Five-digit `char(5)` per tenant via `allocate_tenant_code(tenant_id, entity_type)`.

## UI

Shared `SpreadsheetGrid`: F2 new, Enter edit, arrows navigate, click code/name for modal. **Resizable columns**, **horizontal scroll**, and **subtle grid borders** — see `docs/golden-rules.md`.

## List SQL

Narrow SELECT + `COUNT(*) OVER()` on page 1; partial indexes on `(tenant_id, *_code) WHERE deleted_at IS NULL`.

## Out of scope (full ledger)

Stock transactions, transfers, commercial documents (except read balances), GL.

## Stock balances (read model)

Migration `009_inv_stock_balances.sql`:

| Table / column | Purpose |
|----------------|---------|
| `inv_items.default_location_id` | Default location for balance display |
| `inv_item_location_balances` | Per-location `qty_on_hand` (maintained by seed / future stock epic) |

Item search (`POST /api/v1/inventory/items/search`) returns `default_location_qty` and `total_inv_qty` when `track_inventory_qty` is true. Pass `context_location_id` to show balance at quotation Location-Out instead of item default.

Not a full inventory ledger — quotations and outstanding reports **read** balances only.

## After-Sales (Repair Order MVP)

| Feature | Route | API |
|---------|-------|-----|
| Repair Order List | `/app/inventory/after-sales/repair-orders` | `GET /api/v1/inventory/repair-orders` |
| Repair Order Status | `/app/inventory/after-sales/repair-orders/status` | `GET /api/v1/inventory/repair-orders/status-report` |
| Status print / CSV | filter panel → Print / Excel | `GET .../status-report/export` |
| Receipt / Warranty print | new tab from grid | `GET /api/v1/inventory/repair-orders/{id}/print?doc=receipt\|warranty` |
| New Repair Order | modal / `/repair-orders/new` | `POST /api/v1/inventory/repair-orders` |
| Item picker search | modal | `POST /api/v1/inventory/items/search` |
| Form settings | `/repair-orders/settings` | `GET/PATCH /api/v1/form-field-settings?entity_type=inv_repair_order` |
| Attachments | Repair Order modal | `GET/POST /api/v1/inventory/repair-orders/{id}/attachments` (`REPAIR_ORDER_UPLOAD_DIR`, 25 MB) |

### Register Repair

| Feature | Route | API |
|---------|-------|-----|
| Repair List | `/app/inventory/after-sales/register-repair` | `GET/POST/PATCH/DELETE /api/v1/inventory/repair-registrations` |
| New Repair | `/register-repair/new` | `POST /api/v1/inventory/repair-registrations` |
| Repair Status | `/register-repair/status` | `GET /api/v1/inventory/repair-registrations/status-report` |
| A/S Consumption | `/register-repair/consumption` | `GET /api/v1/inventory/repair-registrations/consumption-report` |
| Convert to RO | list → Convert | `POST /api/v1/inventory/repair-registrations/{id}/convert-to-repair-order` |

### Stock ledger

| Feature | Route | API |
|---------|-------|-----|
| Stock Movements | `/app/inventory/stock-movements` | `GET /api/v1/inventory/stock-movements` |
| Stock Adjustment | modal on movements page | `POST /api/v1/inventory/stock-adjustments` |

Migrations: `006_item_master_extended.sql`, `007_repair_orders.sql`, `008_repair_order_status.sql`, `016_inventory_followups.sql`.
