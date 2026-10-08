# Module enablement matrix (mutating APIs)

**Purpose:** Phase B trust — which write APIs are blocked when a tenant module/feature is off.  
**Middleware:** `api/internal/platform/middleware/module_enablement.go`  
**Behavior:** GET/HEAD/OPTIONS always pass. Platform superadmin and `auto_enable_all_modules` bypass. User-management / settings / auth / platform / onboarding mutations bypass.

Longest matching prefix wins.

| API prefix | module_code | feature_code | Gated | Notes |
|------------|-------------|--------------|-------|-------|
| `/api/v1/inventory/serial-units` | inventory | inventory.serial_lot | Yes | Fixed Phase B (was wrong `/serial-lot`) |
| `/api/v1/inventory/lot-batches` | inventory | inventory.serial_lot | Yes | Phase B |
| `/api/v1/inventory/serial-reports` | inventory | inventory.serial_lot | Yes | Phase B |
| `/api/v1/inventory/lot-reports` | inventory | inventory.serial_lot | Yes | Phase B |
| `/api/v1/inventory/reconciliation` | inventory | inventory.serial_lot | Yes | Phase B |
| `/api/v1/inventory/price-lists` | inventory | inventory.price_lists | Yes | Phase B |
| `/api/v1/inventory/repair-orders` | after_sales | — | Yes | Phase B |
| `/api/v1/inventory/repair-registrations` | after_sales | — | Yes | Phase B |
| `/api/v1/inventory/after-sales` | after_sales | — | Yes | Phase B |
| `/api/v1/inventory` | inventory | — | Yes | Phase B (parent; features win on longer prefixes) |
| `/api/v1/wms` | inventory | inventory.wms | Yes | Pre-existing |
| `/api/v1/quotation` | quotation | — | Yes | Pre-existing |
| `/api/v1/sales-order` | sales_order | — | Yes | Pre-existing |
| `/api/v1/sales` | sales | — | Yes | Pre-existing |
| `/api/v1/selling` | sales | — | Yes | Phase B |
| `/api/v1/purchase-request` | purchase_request | — | Yes | Pre-existing |
| `/api/v1/purchase-order` | purchase_order | — | Yes | Includes RFQ under `/purchase-order/rfq` |
| `/api/v1/goods-receipt` | purchase_order | — | Yes | Pre-existing |
| `/api/v1/buying` | purchase_order | — | Yes | Phase B (buying workspace/reports) |
| `/api/v1/finance/supplier-invoices` | purchases | — | Yes | Pre-existing (longer than `/finance`) |
| `/api/v1/finance` | finance | — | Yes | Phase B |
| `/api/v1/company-budget` | company_budget | — | Yes | Phase B |
| `/api/v1/pos` | pos | — | Yes | Pre-existing |
| `/api/v1/manufacturing` | manufacturing | — | Yes | Phase B |
| `/api/v1/quality` | quality | — | Yes | Phase B |
| `/api/v1/crm` | crm | — | Yes | Phase B |
| `/api/v1/support` | support | — | Yes | Phase B |
| `/api/v1/booking` | booking | — | Yes | Phase B |
| `/api/v1/hr` | hr | — | Yes | Phase B |
| `/api/v1/fixed-assets` | fixed_assets | — | Yes | Phase B |
| `/api/v1/job-costing` | job_costing | — | Yes | Phase B |
| `/api/v1/operations` | operations | — | Yes | Phase B |
| `/api/v1/shipping` | sales or sales_order | — | Yes | Write allowed when either is on. Sales creates shipments from sales-order lines (`/orders/from-lines`). No shipping registry row. |
| `/api/v1/sop` | sop | — | Yes | Pre-existing |
| `/api/v1/okr` | okr | — | Yes | Pre-existing |
| `/api/v1/cms` | cms | — | Yes | Pre-existing |
| `/api/v1/bi` | bi | — | Yes | Phase B |
| `/api/v1/dashboard` | dashboard | — | Yes | Phase B |
| `/api/v1/portal` | portal | — | Debt | Public/portal auth differs; left ungated in Phase B |
| `/api/v1/data-center` | data_center | — | Debt | Product kill-switch in nav; optional later |
| `/api/v1/migration` | — | — | Debt | Admin import; not module-toggled |
| `/api/v1/comms` | — | — | Debt | Platform communications |
| `/api/v1/approvals` | — | — | Debt | Cross-module |
| `/api/v1/copilot` / `/help` | — | — | Debt | Assistants |
| Finance feature splits (`finance.acct_i`, `payment_vouchers`) | finance | feature | Debt | No distinct API prefixes; parent `finance` gate only |

## Remaining ungated debt

1. Portal / migration / comms / approvals / copilot / help — intentional or cross-cutting.  
2. Finance sub-features (`finance.acct_i`, payment vouchers) cannot be API-split without route redesign; parent `finance` covers writes.  
3. Sales collective invoicing feature — no dedicated prefix.  
4. Quotation tax_mngt feature — under `/quotation` parent only.  
5. GET still allowed when module off (by design).

## How to extend

Add a `moduleRouteRule` in `moduleMutationRules` (longest-prefix match). Add a row here. Add a unit test in `module_enablement_test.go`.
