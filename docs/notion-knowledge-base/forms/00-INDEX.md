# Forms & transaction windows — master index

**Purpose:** One place for product owners to compare **every Bluearm screen** to their SOPs: what kind of window it is, which fields matter, and what blocks save/post/approve.

**Evidence:** Observed (code registry / deep dive) · Doc-backed · UNKNOWN  
**Source of truth for cog fields:** `api/internal/platform/formfields/registry.go`  
**Screen list:** `02-MASTER-INVENTORY.md`

---

## Pack contents

| File | What it covers |
|------|----------------|
| `00-INDEX.md` | This file — how to read + full path matrix |
| `01-FORMFIELDS-REGISTRY.md` | All **19** Form Settings entities — every standard field + default required |
| `02-LINE-COLUMNS.md` | Line/list column catalogs (`columnlabels`) |
| `03-SELL-WINDOWS.md` | Quote → SO → Release → DR → SI → OR + shipping |
| `04-BUY-WINDOWS.md` | PR → RFQ → PO → GR → Supplier Invoice → PV |
| `05-INVENTORY-WINDOWS.md` | Masters, stock qty, Entry/Adjustment, WO/BOM (Serial → `09`) |
| `06-ACCOUNTING-WINDOWS.md` | OR, SI, PV, JE, hubs, banking/budgets |
| `07-POS-CRM-SERVICE.md` | POS, CRM, After-Sales, Quality, Support, Booking |
| `08-OPS-HR-CMS-ADMIN.md` | Operations, HR, CMS/SOP/OKR, Comms, Admin, Platform |
| `09-SERIAL-LOT-WINDOWS.md` | Serial registry, receive/scan, register, lots, adjustments |
| `10-CHART-OF-ACCOUNTS.md` | CoA account form + default mappings + PH template |
| `11-GUIDED-NAVIGATION-SCENARIOS.md` | Ordered scenarios, Load Slip, deep-link shortcuts |
| `12-FORM-SUBMISSION-ERRORS.md` | Save/post/approve errors + how to fix |
| `13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md` | What Load Slip copies · attachment requirements |

Parent hub (Notion / import): `17-FORMS-FIELDS-CATALOG.md`

---

## How to read a row

| Column | Meaning |
|--------|---------|
| **Kind** | `master` · `transaction` · `ledger` · `report` · `hub` · `config` · `board` |
| **Entity / draft key** | Form Settings `entity_type` if cog exists; else draft-only / UI key |
| **Form Settings?** | Yes = tenant can hide/require via cog; No = fields are hard-coded in UI/API |
| **Fields** | Header (+ lines pointer). `*` = default required in registry or hard API |
| **Statuses** | Lifecycle values when known |
| **Gates** | What blocks save / submit / post / approve |

Tenants may override registry required/visible via Form Settings. Custom fields can add extra required inputs.

---

## Coverage rules (honest)

1. **Form Settings entities (19)** — field lists are **Observed** from registry.  
2. **Deep-dive transactions** (Sell/Buy/Inventory/Accounting/POS/CRM) — statuses/gates **Observed** or **Doc-backed**.  
3. **Reports / hubs / calendars** — listed as screens; field detail usually N/A (filters only).  
4. **Thin modules** (some HR, CMS articles, Comms, Budgets, Banking, Fixed Assets detail) — path listed; form depth marked **UNKNOWN** until mined from modals.

---

## A. Full screen matrix (every sidebar path)

### Home / Reports / Help

| Screen | Path | Kind | Form Settings? | Notes |
|--------|------|------|----------------|-------|
| Dashboard | `/app/dashboard` | hub | No | Business home |
| Onboarding | `/app/dashboard/onboarding` | hub | No | Playbook |
| Recent updates | `/app/dashboard/recent-updates` | hub | No | |
| Approvals queue | `/app/dashboard/approvals` | board | No | Cross-module approve |
| Reports BI | `/app/reports#reports-bi` | report | No | |
| Report catalog | `/app/reports#report-catalog` | report | No | |
| Saved views | `/app/reports/saved-views` | config | No | |
| Help & guides | `/app/documentation` | hub | No | |
| Baiko | `/app/baiko` | hub | No | |

### Stock (Inventory)

| Screen | Path | Kind | Entity | Form Settings? | Detail file |
|--------|------|------|--------|----------------|-------------|
| Workspace | `/app/inventory` | hub | — | No | `05` |
| Partners | `/app/inventory/partners` | master | `inv_partner` | Yes | `01`, `05` |
| Locations | `/app/inventory/locations` | master | `inv_location` | Yes | `01`, `05` |
| Units | `/app/inventory/units` | master | — | No | `05` |
| Projects | `/app/inventory/projects` | master | `inv_project` | Yes | `01` |
| Departments | `/app/inventory/departments` | master | `inv_department` | Yes | `01` |
| Items | `/app/inventory/items` | master | `inv_item` | Yes | `01`, `05` |
| Item categories | `/app/inventory/item-categories` | master | — | No | `05` |
| Stock Movements | `/app/inventory/stock-movements` | ledger | — | No | `05` |
| Stock Adjustments | `/app/inventory/stock-adjustments` | transaction | `inv_stock_adjustment` (draft) | No | `05` |
| Stock Entries | `/app/inventory/stock-entries` | transaction | — | No | `05` |
| Stock Reconciliation | `/app/inventory/stock-reconciliation` | transaction | — | No | UNKNOWN depth |
| Inv Per Branch | `/app/inventory/find-stock` | report | — | No | |
| Serials registry | `/app/inventory/serial-lot/registry` | board | — | No | `09` |
| Serial receive / lots / reports | `/app/inventory/serial-lot/*` | various | — | No | `09` |
| Stock reports (×6) | `/app/inventory/reports/*` | report | — | No | |
| Price lists | `/app/inventory/price-lists` | master | — | No | UNKNOWN |
| Product bundles | `/app/inventory/product-bundles` | master | — | No | UNKNOWN |
| BOMs | `.../manufacturing/boms` | master | `mfg_bom` (draft) | No | `05` |
| Work Orders | `.../manufacturing/work-orders` | transaction | `mfg_work_order` (draft) | No | `05` |
| WMS scheduled receipts | `/app/inventory/wms/scheduled-receipts` | board | — | No | UNKNOWN |

### Sell chain

| Screen | Path | Kind | Entity | Form Settings? | Detail |
|--------|------|------|--------|----------------|--------|
| Quotation | `/app/quotation/quotations` | transaction | `quo_quotation` | Yes | `01`, `03` |
| Tax types | `/app/quotation/tax-mngt/tax-types` | master | `quo_tax_type` | Yes | `01` |
| Currencies | `/app/quotation/tax-mngt/currencies` | master | `quo_currency` | Yes | `01` |
| Sales orders | `/app/sales-order/sales-orders` | transaction | `so_sales_order` | Yes | `01`, `03` |
| Pick / Release | `/app/sales-order/sales-orders/release` | transaction | — | No | `03` |
| Delivery notes | `/app/sales-order/delivery-receipts` | transaction | `so_delivery_receipt` (draft) | No | `03` |
| Shipping orders | `/app/sales-order/shipping/orders` | transaction | — | No | `03` |
| Shipping rules | `/app/sales-order/shipping/rules` | config | — | No | UNKNOWN |
| Delivery trips | `/app/sales-order/shipping/trips` | transaction | — | No | `03` |
| SO reports | `/app/sales-order/reports/*` | report | — | No | |
| Sales invoices | `/app/sales/sales` | transaction | `sa_sales` | Yes | `01`, `03` |
| Sales categories | `/app/sales/sales-categories` | master | — | No | |
| Retainer / Recurring / Credit notes | `/app/sales/*` | transaction | — | No | UNKNOWN |
| Sales returns | `/app/sales/sales-returns` | transaction | — | No | `03` thin |
| Collective invoicing | `/app/sales/collective-invoicing/list` | transaction | — | No | `03` |
| Selling / commissions hubs | `/app/selling/*` | hub/report | — | No | |

### Buy chain

| Screen | Path | Kind | Entity | Form Settings? | Detail |
|--------|------|------|--------|----------------|--------|
| Purchase requests | `/app/purchase-request/purchase-requests` | transaction | `pr_purchase_request` | Yes | `01`, `04` |
| Purchase orders | `/app/purchase-order/purchase-orders` | transaction | `po_purchase_order` | Yes | `01`, `04` |
| RFQ | `/app/purchase-order/rfq` | transaction | — | No | `04` |
| Purchase returns | `/app/purchase-order/purchase-returns` | transaction | — | No | thin |
| Goods receipt | `/app/purchases/purchase-receive` | transaction | `gr_goods_receipt` | Yes | `01`, `04` |
| Expenses / Recurring / Vendor credits | `/app/purchases/*` | transaction | — | No | UNKNOWN |
| Buying reports | `/app/buying/*` | hub/report | — | No | |

### Finance / Assets

| Screen | Path | Kind | Entity | Form Settings? | Detail |
|--------|------|------|--------|----------------|--------|
| Finance workspace | `/app/finance` | hub | — | No | `06` |
| Bookkeeping | `/app/finance/bookkeeping` | hub | — | No | |
| Journal entries | `/app/finance/acct-i/journal-entries` | transaction | `fin_journal_entry` (draft) | No | `06` |
| Chart of accounts | `/app/finance/acct-i/chart-of-accounts` | master/config | `fin_account` (draft) | No | `10` |
| Receivables | `/app/finance/receivables` | hub | — | No | → OR |
| Payables | `/app/finance/payables` | hub | — | No | → PV |
| Official receipts | `/app/finance/official-receipts` | transaction | `fin_official_receipt` | Yes | `01`, `06` |
| Payment vouchers | `/app/finance/payment-vouchers` | transaction | `fin_payment_voucher` (draft) | No | `06` |
| Supplier invoices (finance path) | `/app/finance/supplier-invoices` | transaction | `fin_supplier_invoice` | Yes* | `01`, `06` |
| Banking / Budgets / Statutory / Reports | `/app/finance/*` | hub/report/config | — | No | UNKNOWN depth |
| Fixed assets | `/app/fixed-assets` | master/transaction | `fixed_asset` (draft) | No | UNKNOWN |

\*Settings href often under purchase-receive settings.

### CRM / Service

| Screen | Path | Kind | Entity | Form Settings? | Detail |
|--------|------|------|--------|----------------|--------|
| CRM dashboards / notifications | `/app/crm/*` | hub/board | — | No | `07` |
| Leads | `/app/crm/leads` | transaction | `crm_lead` (draft) | No | `07` |
| Opportunities | `/app/crm/opportunities` | transaction | `crm_opportunity` (draft) | No | `07` |
| Clients | `/app/crm/clients` | board | — | No | read health |
| Follow-up tasks | `/app/crm/follow-up-tasks` | transaction | `crm_follow_up_task` | No* | `07` |
| Quote board | `/app/crm/pipelines/quotations` | board | (quotations) | No | `03`/`07` |
| Alert rules | `/app/crm/settings/alert-rules` | config | `crm_alert_rule` | No | `07` |
| Repair orders | `/app/after-sales/repair-orders` | transaction | `inv_repair_order` | Yes | `01`, `07` |
| Customer intake | `/app/after-sales/register-repair` | transaction | — | No | `07` |
| Warranty | `/app/after-sales/warranty` | master | `crm_warranty_asset` | No | `07` |
| Quality NCR/QC/CAPA | `/app/quality/*` | transaction | `qa_ncr` / `qa_capa` (draft) | No | `07` |
| Support tickets | `/app/support/tickets` | transaction | `support_ticket` (draft) | No | `07` |
| Booking | `/app/booking/*` | transaction/config | — | No | `07` |

\*CRM entity constants exist; **not** in formfields `standardRegistry`.

### POS / HR

| Screen | Path | Kind | Entity | Form Settings? | Detail |
|--------|------|------|--------|----------------|--------|
| POS terminal | `/app/pos` | transaction | `pos_order_ui` (draft) | No | `07` |
| POS manage | `/app/pos/manage` | config | — | No | `07` |
| Employees | `/app/hr/employees` | master | `hr_employee` | Yes | `01`, `08` |
| Attendance / Leave / Discipline / … | `/app/hr/*` | transaction | various draft keys | No | `08` thin |
| Payroll / Remittances / ESS | `/app/hr/*` | transaction/hub | — | No | `08` |

### Operations / Content / Comms

| Screen | Path | Kind | Entity | Form Settings? | Detail |
|--------|------|------|--------|----------------|--------|
| Operations hub / tasks / packs / … | `/app/operations/*` | hub/board/transaction | `ops_work_item` | Yes (work items) | `01`, `08` |
| SOP | `/app/sop` | hub | — | No | |
| OKR | `/app/okr` | hub | — | No | |
| CMS pages | `/app/cms` | master | `cms_page` | Yes | `01`, `08` |
| Articles / Media / Redirects | `/app/cms/*`, `/articles` | master | — | No | UNKNOWN |
| Comms | `/app/comms/*` | hub | — | No | UNKNOWN |

### Admin / Platform

| Screen | Path | Kind | Entity | Form Settings? | Detail |
|--------|------|------|--------|----------------|--------|
| Users / Roles / Groups / Scopes | `/app/user-management/*` | config | — | No | `08` |
| Modules & features | `/app/user-management/tenant-modules` | config | — | No | |
| Process policies | `/app/user-management/process-policies` | config | — | No | gates live here |
| Mapping / Migration / Demo | `/app/user-management/*` | config | — | No | `08` |
| Data Center | `/app/data-center/*` | config/transaction | — | No | `08` |
| Activity logs | `/app/activity-logs` | ledger | — | No | |
| Setup wizard | `/app/setup` | config | — | No | Foundation HARD gate |
| Sign-in | `/signin` | platform | — | No | |

---

## B. Form Settings entities at a glance (19)

| entity_type | Typical screen | Settings path (app) |
|-------------|----------------|---------------------|
| `inv_partner` | Partners | `/app/inventory/partners/settings` |
| `inv_location` | Locations | `/app/inventory/locations/settings` |
| `inv_project` | Projects | `/app/inventory/projects/settings` |
| `inv_department` | Departments | `/app/inventory/departments/settings` |
| `inv_item` | Items | `/app/inventory/items/settings` |
| `inv_repair_order` | Repair Orders | `/app/after-sales/repair-orders/settings` |
| `quo_tax_type` | Tax types | `/app/quotation/tax-mngt/tax-types/settings` |
| `quo_currency` | Currencies | `/app/quotation/tax-mngt/currencies/settings` |
| `quo_quotation` | Quotations | `/app/quotation/quotations/settings` |
| `sa_sales` | Sales invoices | `/app/sales/sales/settings` |
| `so_sales_order` | Sales orders | `/app/sales-order/sales-orders/settings` |
| `fin_official_receipt` | Official receipts | `/app/finance/official-receipts/settings` |
| `pr_purchase_request` | Purchase requests | `/app/purchase-request/purchase-requests/settings` |
| `po_purchase_order` | Purchase orders | `/app/purchase-order/purchase-orders/settings` |
| `gr_goods_receipt` | Goods receipt | `/app/purchase-order/goods-receipt/settings` |
| `fin_supplier_invoice` | Supplier invoices | `/app/purchases/purchase-receive/settings` |
| `ops_work_item` | Operations work items | `/app/operations/work-items/settings` |
| `hr_employee` | Employees | `/app/hr/employees/settings` |
| `cms_page` | CMS pages | `/app/cms/pages/settings` |

Full field matrices → `01-FORMFIELDS-REGISTRY.md`

---

## C. Related deep dives (status machines & handoffs)

| Topic | File |
|-------|------|
| Sell | `../13-DEEP-SELL-QUOTE-TO-RECEIPT.md` |
| Buy | `../14-DEEP-BUY-REQUEST-TO-RECEIVE.md` |
| Inventory | `../15-DEEP-INVENTORY-SERIAL-MOVEMENTS.md` |
| Accounting | `../16-DEEP-ACCOUNTING-FORMS.md` |
| POS | `../18-DEEP-POS.md` |
| CRM | `../19-DEEP-CRM.md` |
| Policies | `../05-PROCESS-POLICIES-AND-GATES.md` |

---

## D. Maintenance

When adding a screen or changing required fields:

1. Update `02-MASTER-INVENTORY.md` if it is a sidebar path.  
2. If Form Settings entity: update `registry.go` **and** `01-FORMFIELDS-REGISTRY.md`.  
3. Update the matching `03`–`08` window file + deep dive if statuses/gates change.  
4. Refresh Notion Forms hub in the same PR.
