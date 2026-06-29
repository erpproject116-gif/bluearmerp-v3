# Business Dashboard (Phase A)

Tenant-wide executive dashboard for store owners and admins. Separate from the **CRM Dashboard** (`/app/crm/dashboard`), which remains PIC-scoped for sales follow-up work.

## Navigation

Sidebar → **Business Dashboard** → `/app/dashboard`

Requires module `dashboard` enabled and permission `dashboard.view`.

## Permissions

| Code | Purpose |
|------|---------|
| `dashboard` | Module access |
| `dashboard.view` | View dashboard shell |
| `dashboard.kpis` | KPI tiles (sales MTD/YTD, low stock, AR, open PO, warranty due, quotes) |
| `dashboard.charts` | MoM sales/inventory trends + top customers/vendors/items |
| `dashboard.red_flags` | Discrepancy and operational alert panel |
| `dashboard.financial_summary` | AR summary only in Phase A (P&L / payables deferred) |

Default: `store_admin` has write on all dashboard permissions; `member` has none (configurable in User Management).

Migration: `api/migrations/049_dashboard.sql`

## APIs

All routes under `/api/v1/dashboard/`:

| Endpoint | Permission | Content |
|----------|------------|---------|
| `GET /summary` | `dashboard.kpis` | Sales MTD/YTD, low stock count, AR customers, open PO lines, warranty due, expired/expiring quotes |
| `GET /sales-trend?months=12` | `dashboard.charts` | Monthly `grand_total` from `sa_sales` |
| `GET /inventory-trend?months=12` | `dashboard.charts` | Sum of `inv_stock_movements.qty_delta` by month |
| `GET /top-customers?limit=10&days=90` | `dashboard.charts` | Sales by partner |
| `GET /top-vendors?limit=10&days=90` | `dashboard.charts` | Spend proxy from posted GR / PO value |
| `GET /top-items?limit=10&days=90` | `dashboard.charts` | Sales line qty |
| `GET /red-flags` | `dashboard.red_flags` | Aggregated operational alerts |

### Red flag categories

| Code | Source |
|------|--------|
| `low_stock` | `inv_item_location_balances` below reorder level |
| `expired_quotes` / `quotes_expiring_7d` | `quo_quotations` validity |
| `unconverted_quote_so` / `unconverted_so_sales` | Quote → SO → Sales pipeline gaps |
| `serial_qty_mismatch` | Reconciliation: qty vs serial count |
| `reserved_stale` | Serials `reserved` past threshold days |
| `open_po_not_received` | PO lines where `qty > received_qty` |
| `so_release_gap` | Sold qty exceeds released qty on SO lines |

Drill-down links in the UI route to existing list pages (quotations, serial trace, purchase orders, etc.).

## Hybrid stock semantics (for owners)

Stock movement policy used by dashboard reconciliation:

| Path | When qty moves | Serial behavior |
|------|----------------|-----------------|
| **Goods Receipt post** | `qty_on_hand` increases | Serial units → `in_stock` |
| **SO Release** | `qty_on_hand` decreases | Serials → `reserved` |
| **Sales from SO line** | No extra qty move (release already deducted) | Serials → `sold`; qty validated ≤ released |
| **Direct sales** (no SO line) | `qty_on_hand` decreases at invoice | Serial pick required when `track_serial` |

See [serial-lot README](../inventory/serial-lot/README.md) for traceability APIs and reversal flows.

## Reconciliation APIs (inventory)

Used by dashboard red flags and available directly:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/inventory/reconciliation/serial-qty` | Per item+location: balance vs serial count |
| `GET /api/v1/inventory/reconciliation/reserved-stale?days=30` | Stale reserved serials |
| `GET /api/v1/inventory/reconciliation/so-release-gap` | SO lines sold beyond release |

## Deferred (not in Phase A)

- P&L, cashflow, full payables/AP
- Vendor bills and payment runs
- COGS / cost layers on receipt
- Email/SMS dashboard alerts (in-app + CRM notifications only)

## Demo data

After migrations 047–049 and standard demo seeds:

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-dashboard.sql
```

Creates an intentional serial-vs-qty mismatch on a demo serial-tracked item so red flags are visible without fake financials.

## Verification checklist

1. `go build ./...` and `npm run build`
2. Store admin sees Business Dashboard in sidebar; member without permissions does not
3. KPI tiles load with `dashboard.kpis`
4. Sales trend chart shows last 12 months with `dashboard.charts`
5. Red flags panel shows counts; serial mismatch appears after `seed-demo-dashboard.sql`
6. CRM dashboard still works at `/app/crm/dashboard` for PIC-scoped analytics
