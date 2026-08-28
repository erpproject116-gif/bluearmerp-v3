# Route → permission matrix (screen access)

**Source:** `web/src/shared/permissionCodes.ts` (`hrefPermissionCode`)  
**Scope:** Which **permission code** the UI expects to **open a route** (read gate for nav).  
**Not in scope:** Every write/approve action code (those live on API `RequirePermission` / `RequireSubmit`). Approve snippets stay in policies §G and module playbooks.

> **G-13 status:** Closed for **route access**. Full button-level matrix remains a living extract from API handlers — start from this file + `permission_registry` migrations.

Helper: `permissionCodeForHref(href)` strips query/hash; falls back for nested tickets/CMS/booking/etc.

---

## Home / platform

| Path | Permission |
|------|------------|
| `/app/dashboard` (+ onboarding, recent-updates, approvals, period-summary, site-map) | `dashboard.view` |
| `/app/baiko`, `/app/copilot` | `dashboard.view` |
| `/app/reports/saved-views` | `bi.saved_views` |

## Stock / inventory

| Path | Permission |
|------|------------|
| Partners / Locations / Projects / Departments / Items | `inventory.partners` … `inventory.items` |
| Stock movements / adjustments / reconciliation / find-stock / most stock reports | `inventory.stock_movements` |
| Stock entries | `inventory.stock_entries` |
| Price lists | `inventory.price_lists` |
| Serial registry / lots / reports | `inventory.serial_registry` |
| Serial adjustment | `inventory.serial_adjustment` |
| Serial movements / book | `inventory.serial_movements` |
| Serial trace / receive / settings | `inventory.serial_trace` / `serial_receive` / `serial_settings` |
| BOMs / Work orders | `manufacturing.boms` / `manufacturing.work_orders` |
| WMS scheduled receipts | `wms.read` |

## After-sales

| Path | Permission |
|------|------------|
| Repair orders / new / status | `after_sales.repair_orders*` |
| Register repair / status / consumption | `after_sales.register_repair*` |
| Customer warranty | `crm.warranty_assets` |

## Quotation / tax

| Path | Permission |
|------|------------|
| Quotations new / list / status / outstanding | `quotation.quotations*` |
| Tax types / currencies | `quotation.tax_types` / `quotation.currencies` |

## Sales order / shipping

| Path | Permission |
|------|------------|
| SO new / list / status / outstanding / release | `sales_order.sales_orders*` |
| Delivery receipts | `sales_order.delivery_receipts*` |
| SO analysis / fulfillment | `sales_order.sales_orders_status` |
| Shipment / pending / shipping-order status | `shipping_order.*` |
| Shipping orders / rules | `shipping_order.read` |
| Delivery trips | `delivery_trip.read` |

## Purchase request / order / receive

| Path | Permission |
|------|------------|
| PR new / list / status | `purchase_request.purchase_requests*` |
| PO list / RFQ / GR / status / outstanding | `purchase_order.*` |
| Purchase receive (purchases.*) | `purchases.purchases*` |
| Buying purchase-status reports | `buying.purchase_status` |

## Sales / collective / selling reports

| Path | Permission |
|------|------------|
| Sales new / list / status / pre-invoicing / price-batch | `sales.sales*` |
| Returns | `sales.sales_returns` |
| Commissions | `sales.commission_read` |
| OR / SI receipt / AR / credit / discount / print slips | `sales.*` report codes |
| Collective list / status | `sales.collective_invoice_list` / `collective_invoice_status` |
| Selling reports hub | `selling.sales_reports` |

## Finance

| Path | Permission |
|------|------------|
| Official receipts / new / receivables hub | `finance.official_receipts*` |
| Payment vouchers / new / payables hub | `finance.payment_vouchers*` |
| Supplier invoices / new | `finance.supplier_invoices*` |
| Journal / CoA / bank recon / fiscal / TB / P&L / BS / cash reports | `finance.journal_entries` |
| Expenses / recurring / vendor credits / credit notes / retainers / recurring SI | matching `finance.*` |
| AR/AP / receipt / supplier payment reports | `finance.reports_*` |
| Budgets | `finance.budget_read` |
| Checks / withholding / notes / landed cost / contracts | matching `finance.*_read` |
| BIR statutory | `finance.statutory_read` |

**Approve (API, not in href map):** `finance.supplier_invoices_approve` · `purchase_order.approve` · `sales.approve` · `purchase_request.approve`

## CRM / support / comms

| Path | Permission |
|------|------------|
| CRM screens | `crm.*` as mapped |
| Alert rules | `crm.settings_alert_rules` |
| Support tickets | `support.tickets` |
| Inbox / chat / sent / settings | `comms.inbox` / `chat` / `read` / `admin` |

## POS / HR / quality / ops / content

| Path | Permission |
|------|------------|
| POS terminal / manage | `pos.terminal` / `pos.manage` |
| HR employees / payroll / pay items / special / remittances / attendance | `hr.*` |
| Quality NCR / QC / CAPA | `quality.*` |
| Fixed assets | `fixed_assets.assets` |
| Operations dashboard / job costing | `operations.dashboard` / `job_costing.projects` |
| SOP / OKR / CMS / booking | `sop.documents` / `okr.objectives` / `cms.*` / `booking.*` |
| Activity logs | `activity_logs.logs` / `changes` |
| Data center | `data_center.read` |

## User management / setup

| Path | Permission |
|------|------------|
| Users / roles / help feedback | `user_management.users` / `roles` |
| Mapping Center (href map) | `user_management.users` |
| Mapping Center (registry also has) | `user_management.doc_generation` |
| Process policies + module setup hubs | `settings.process_policies` |
| Tenant modules | `settings.tenant_modules` |
| Demo data | `settings.demo_data` |
| Migration center | `migration.center` |

> Note: href map uses `user_management.users` for Mapping Center; migration `086` also registers `user_management.doc_generation`. Prefer granting both for admins until UI/API align on one code.

---

## How to extend

1. Add route → code in `permissionCodes.ts`.  
2. Ensure `permission_registry` row exists (migrations).  
3. Assign on roles under User Management → Roles.  
4. For write/approve actions, grep API `RequirePermission(` — do not invent codes.
