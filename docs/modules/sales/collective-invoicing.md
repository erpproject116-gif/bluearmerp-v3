# Collective Invoicing (Sales)

Sales header tabs for collective (batch) invoicing: **Sales Invoice List (Inv.)** and **Sales Invoice Status (Inv.)**.

## Routes

| Route | Purpose |
|-------|---------|
| `/app/sales/collective-invoicing/list` | Invoice list with View Trans., Sales Slip, Print |
| `/app/sales/collective-invoicing/status` | Filtered status report with subtotals |
| `/app/sales/collective-invoicing/:id/slip/print` | Aggregated sales slip |
| `/app/sales/collective-invoicing/:id/invoice/print?mode=voucher\|ar_statement` | Invoice voucher or A/R statement |
| `/app/sales/collective-invoicing/status/print` | Multi-page status print |

## Permissions

- `sales.collective_invoice_list` — List tab
- `sales.collective_invoice_status` — Status tab

Migrations: `033_collective_invoicing.sql`, `034_collective_invoicing_permissions.sql`, `035_collective_invoice_report_templates.sql`.

## Creation

1. **Manual** — Sales List: check eligible rows (completed, not invoiced) → **Create collective invoice**.
2. **Auto-batch** — Invoice List → **Batch eligible sales** (`POST /collective-invoices/auto-batch`).

## Status lifecycle

| Header status | Linked `sa_sales` |
|---------------|-------------------|
| `unconfirmed` | No change |
| `e_approval` | Header only |
| `confirmed` | `invoicing_status = true` |
| `cancelled` | Unlink sales (links removed) |

## Deferred

- **Tax Entity** filter — UI checkbox only (no schema).
- **XLSX** export — CSV only today.
- **Link/Unlink Inv. Slips** — phase 2.
