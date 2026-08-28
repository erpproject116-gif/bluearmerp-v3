# Master inventory — every module and feature

**Source of truth:** `web/src/shell/modules.ts` (`appModules`)  
**Observed:** 2026-08-26 pack build  
**Rule:** If it is not here, it is not a sidebar module. Platform routes outside this list (e.g. `/app/setup`, sign-in) are listed at the bottom under **Platform routes**.

> Feature tabs may be hidden by `featureCode`, `managersOnly`, `analyticsOnly`, or `headerHidden`. Hidden ≠ deleted — routes often still work.

---

## Summary counts

| Module id | Label (sidebar) | Feature tabs (listed) | Sub-branches |
|-----------|-----------------|----------------------:|-------------:|
| dashboard | Home | 3 | 0 |
| reports | Reports | 3 | 0 |
| inventory | Stock | 24 | 2 |
| buying | Purchase overview | 6+setup | 0 |
| selling | Sale overview | 5+setup | 0 |
| after_sales | After-Sales | 6 | 0 |
| quotation | Quotation | 2+setup | 0 |
| sales | Sales | 15+setup | 1 |
| sales_order | Sales Order | 13+setup | 0 |
| purchase_request | Purchase Request | 2+setup | 0 |
| purchase_order | Purchase Order | 5+setup | 0 |
| purchases | Purchase Receive | 9+setup | 0 |
| crm | CRM | 9 | 0 |
| quality | Quality | 3 | 0 |
| support | Support | 1 | 0 |
| booking | Booking | 4 | 0 |
| comms | Communications | 4 | 0 |
| operations | Project Management | 8 | 0 |
| sop | SOP | 2 | 0 |
| cms | Pages | 4 | 0 |
| okr | OKRs | 2 | 0 |
| pos | POS | 2+setup | 0 |
| hr | HR & Payroll | 13 | 0 |
| fixed_assets | Fixed Assets | 1 | 0 |
| finance | Accounting overview | 13+setup | 4 |
| data_center | Data Center | 2 | 0 |
| activity_logs | Activity Logs | 2 | 0 |
| documentation | Help & guides | 2 | 0 |
| user_management | User Management | 10 | 0 |

---

## 1. Home (`dashboard`)

| Feature | Path | Notes |
|---------|------|-------|
| Dashboard | `/app/dashboard` | Business home |
| Onboarding | `/app/dashboard/onboarding` | ERP+POS playbook |
| Recent updates | `/app/dashboard/recent-updates` | Product updates |

## 2. Reports (`reports`)

| Feature | Path | Notes |
|---------|------|-------|
| Dashboard & charts | `/app/reports#reports-bi` | BI charts |
| Catalog | `/app/reports#report-catalog` | Report catalog |
| Saved Views | `/app/reports/saved-views` | Saved views |

## 3. Stock (`inventory`)

| Feature | Path | featureCode / flags |
|---------|------|---------------------|
| Workspace | `/app/inventory` | overflow |
| Partners | `/app/inventory/partners` | headerHidden; settings `/partners/settings` |
| Locations | `/app/inventory/locations` | settings |
| Units | `/app/inventory/units` | |
| Projects | `/app/inventory/projects` | settings |
| Departments | `/app/inventory/departments` | settings |
| Items | `/app/inventory/items` | primary; settings |
| Item categories | `/app/inventory/item-categories` | |
| Stock Movements | `/app/inventory/stock-movements` | primary |
| Stock Adjustments | `/app/inventory/stock-adjustments` | primary |
| Stock Entries | `/app/inventory/stock-entries` | |
| Stock Reconciliation | `/app/inventory/stock-reconciliation` | |
| Inv Per Branch | `/app/inventory/find-stock` | primary |
| Serials | `/app/inventory/serial-lot/registry` | `inventory.serial_lot` |
| Stock Balance | `/app/inventory/reports/stock-balance` | overflow (hidden from header via reports filter) |
| On Hand | `/app/inventory/reports/on-hand` | |
| Inventory Status | `/app/inventory/reports/inventory-status` | |
| Stock Ledger | `/app/inventory/reports/stock-ledger` | |
| Inv. Book | `/app/inventory/reports/inv-book` | |
| Stock Ageing | `/app/inventory/reports/stock-ageing` | |
| Price List | `/app/inventory/price-lists` | `inventory.price_lists` |
| Product Bundles | `/app/inventory/product-bundles` | |
| BOMs | `/app/inventory/serial-lot/manufacturing/boms` | `manufacturing.boms` |
| Work Orders | `/app/inventory/serial-lot/manufacturing/work-orders` | `manufacturing.work_orders` |

**Sub-branches**

| Branch | Path | featureCode |
|--------|------|-------------|
| Batch & serial tracking | `/app/inventory/serial-lot/registry` | `inventory.serial_lot` |
| Warehouse | `/app/inventory/wms/scheduled-receipts` | `inventory.wms` |

## 4. Purchase overview (`buying`)

| Feature | Path | featureCode |
|---------|------|-------------|
| Workspace | `/app/buying` | |
| Expenses | `/app/purchases/expenses` | `finance.expenses` |
| Recurring Expenses | `/app/purchases/recurring-expenses` | `finance.recurring_expenses` |
| Reports | `/app/buying/reports` | |
| Purchase Status | `/app/buying/reports/purchase-status` | |
| Pre-Invoicing (Purchases) | `/app/purchases/purchase-receive/pre-invoicing` | |
| Setup | (via `setupFeatureTab`) | |

## 5. Sale overview (`selling`)

| Feature | Path | Notes |
|---------|------|-------|
| Workspace | `/app/selling` | |
| Reports | `/app/selling/reports` | |
| Sales Status | `/app/selling/reports` | same hub |
| Receivable Status | `/app/selling/reports/receivable-status` | |
| Commissions | `/app/selling/commissions` | |
| Setup | | |

## 6. After-Sales (`after_sales`)

| Feature | Path |
|---------|------|
| Repair Orders | `/app/after-sales/repair-orders` |
| Status | `/app/after-sales/repair-orders/status` |
| Customer Intake | `/app/after-sales/register-repair` |
| Intake Status | `/app/after-sales/register-repair/status` |
| Parts Consumption | `/app/after-sales/register-repair/consumption` |
| Customer Warranty | `/app/after-sales/warranty` |

## 7. Quotation (`quotation`)

| Feature | Path |
|---------|------|
| Quotations | `/app/quotation/quotations` |
| Quote board | `/app/crm/pipelines/quotations` |
| Setup | |

## 8. Sales (`sales`)

| Feature | Path | featureCode / flags |
|---------|------|---------------------|
| Sales | `/app/sales/sales` | primary |
| Sales categories | `/app/sales/sales-categories` | |
| New Receivable Payment | `/app/finance/receivables` | `finance.acct_ii` |
| Retainer Invoices | `/app/sales/retainer-invoices` | |
| Recurring Invoices | `/app/sales/recurring-invoices` | |
| Credit Notes | `/app/sales/credit-notes` | |
| Reports | `/app/selling/reports` | |
| Pre-invoicing | `/app/sales/sales/pre-invoicing` | |
| Price batch | `/app/sales/sales/price-batch` | |
| Discount status | `/app/sales/reports/discount-status` | |
| Print slips | `/app/sales/reports/print-slips` | |
| Returns | `/app/sales/sales-returns` | |
| Commissions | `/app/sales/commission-rules` | |
| SI receipts | `/app/sales/reports/si-receipt-status` | |
| Customer credit | `/app/sales/reports/customer-credit-balance` | |
| AR by customer | `/app/sales/reports/ar-by-customer` | |
| Setup | | |

**Sub-branch:** Combined invoices → `/app/sales/collective-invoicing/list` (`sales.collective_invoicing`)

## 9. Sales Order (`sales_order`)

| Feature | Path |
|---------|------|
| Sales orders | `/app/sales-order/sales-orders` |
| Reports | `/app/sales-order/reports` |
| Pick list | `/app/sales-order/sales-orders/release` |
| Delivery notes | `/app/sales-order/delivery-receipts` |
| Fulfillment progress | `/app/sales-order/reports/fulfillment-progress` |
| SO Analysis | `/app/sales-order/reports/so-analysis` |
| Shipment Status | `/app/sales-order/reports/shipment-status` |
| Pending Shipment | `/app/sales-order/reports/pending-shipment` |
| Shipping Order Status | `/app/sales-order/reports/shipping-order-status` |
| Shipping Orders | `/app/sales-order/shipping/orders` |
| Shipping Rules | `/app/sales-order/shipping/rules` |
| Delivery Trips | `/app/sales-order/shipping/trips` |
| Setup | |

## 10. Purchase Request (`purchase_request`)

| Feature | Path |
|---------|------|
| Purchase Request List | `/app/purchase-request/purchase-requests` |
| Status | `/app/purchase-request/purchase-requests/status` |
| Default href (new) | `/app/purchase-request/purchase-requests/new` |
| Setup | |

## 11. Purchase Order (`purchase_order`)

| Feature | Path |
|---------|------|
| Purchase orders | `/app/purchase-order/purchase-orders` |
| Reports | `/app/buying/reports` |
| RFQ | `/app/purchase-order/rfq` |
| Returns | `/app/purchase-order/purchase-returns` |
| PO analysis | `/app/purchase-order/reports/po-analysis` |
| To receive | `/app/purchase-order/reports/items-to-receive` |
| Setup | |

## 12. Purchase Receive (`purchases`)

| Feature | Path | featureCode |
|---------|------|-------------|
| Purchase receive | `/app/purchases/purchase-receive` | |
| New Payable Payment | `/app/finance/payables` | `finance.acct_ii` |
| Expenses | `/app/purchases/expenses` | `finance.expenses` |
| Recurring Expenses | `/app/purchases/recurring-expenses` | `finance.recurring_expenses` |
| Vendor Credits | `/app/purchases/vendor-credits` | `finance.vendor_credits` |
| Reports | `/app/buying/reports` | |
| Pre-invoicing | `/app/purchases/purchase-receive/pre-invoicing` | |
| Payment status | `/app/purchases/purchase-receive/payment-status` | |
| A/P by vendor | `/app/purchases/purchase-receive/ap-by-vendor` | |
| Setup | | |

## 13. CRM (`crm`)

| Feature | Path | Flags |
|---------|------|-------|
| My pipeline | `/app/crm/dashboard` | |
| Leads dashboard | `/app/crm/leads/dashboard` | |
| Notifications | `/app/crm/notifications` | |
| Follow-up Tasks | `/app/crm/follow-up-tasks` | |
| Leads | `/app/crm/leads` | |
| Clients | `/app/crm/clients` | |
| Opportunities | `/app/crm/opportunities` | |
| Quote board | `/app/crm/pipelines/quotations` | |
| Alert Rules | `/app/crm/settings/alert-rules` | managersOnly |

## 14. Quality (`quality`)

| Feature | Path |
|---------|------|
| NCRs | `/app/quality/ncrs` |
| QC Requests | `/app/quality/qc-requests` |
| CAPA | `/app/quality/capa` |

## 15. Support (`support`)

| Feature | Path |
|---------|------|
| Tickets | `/app/support/tickets` |

## 16. Booking (`booking`)

| Feature | Path |
|---------|------|
| Calendar | `/app/booking/calendar` |
| Bookings | `/app/booking/bookings` |
| Resources | `/app/booking/resources` |
| Services | `/app/booking/services` |

## 17. Communications (`comms`)

| Feature | Path |
|---------|------|
| Team Chat | `/app/comms/chat` |
| Inbox | `/app/comms/inbox` |
| Sent Documents | `/app/comms/sent-documents` |
| Settings | `/app/comms/settings` |

## 18. Project Management (`operations`)

| Feature | Path |
|---------|------|
| Work hub | `/app/operations` |
| Industry packs | `/app/operations/packs` |
| Calendar | `/app/operations/calendar` |
| Timeline | `/app/operations/timeline` |
| Project dashboard | `/app/operations/dashboard` |
| Tasks dashboard | `/app/operations/tasks` |
| Job costing | `/app/operations/job-costing` |
| Automation | `/app/operations/automation` |

## 19. SOP (`sop`)

| Feature | Path |
|---------|------|
| Library | `/app/sop` |
| Dashboard | `/app/sop/dashboard` |

## 20. Pages (`cms`)

| Feature | Path |
|---------|------|
| Pages | `/app/cms` |
| Articles | `/articles` (also `/app/articles`) |
| Media | `/app/cms/media` |
| Redirects | `/app/cms/redirects` |

## 21. OKRs (`okr`)

| Feature | Path |
|---------|------|
| Objectives | `/app/okr` |
| Dashboard | `/app/okr/dashboard` |

## 22. POS (`pos`)

| Feature | Path | Flags |
|---------|------|-------|
| Terminal | `/app/pos` | |
| Manage | `/app/pos/manage` | managersOnly |
| Setup | | |

## 23. HR & Payroll (`hr`)

| Feature | Path |
|---------|------|
| Employees | `/app/hr/employees` |
| Attendance / DTR | `/app/hr/attendance` |
| Leave | `/app/hr/leave` |
| Absenteeism | `/app/hr/absenteeism` |
| Discipline | `/app/hr/discipline` |
| Hire onboarding | `/app/hr/hire-onboarding` |
| Evaluations | `/app/hr/evaluations` |
| Learning | `/app/hr/learning` |
| Pay items | `/app/hr/pay-items` |
| Payroll | `/app/hr/payroll-runs` |
| 13th / Final pay | `/app/hr/special-runs` |
| Remittances | `/app/hr/remittances` |
| My HR (ESS) | `/app/hr/ess` |

## 24. Fixed Assets (`fixed_assets`)

| Feature | Path |
|---------|------|
| Asset Register | `/app/fixed-assets` |

## 25. Accounting overview (`finance`)

| Feature | Path | featureCode |
|---------|------|-------------|
| Workspace | `/app/finance` | |
| Bookkeeping | `/app/finance/bookkeeping` | `finance.acct_i` |
| New Receivable Payment | `/app/finance/receivables` | `finance.acct_ii` |
| New Payable Payment | `/app/finance/payables` | `finance.acct_ii` |
| Banking | `/app/finance/banking` | |
| Reports | `/app/finance/reports` | |
| Receipts | `/app/finance/official-receipts` | |
| Vouchers | `/app/finance/payment-vouchers` | |
| Budgets | `/app/finance/budgets` | |
| BIR Statutory | `/app/finance/statutory` | `finance.statutory_read` |
| Payroll | `/app/hr/payroll-runs` | cross-link |
| Remittances | `/app/hr/remittances` | cross-link |
| Assets | `/app/fixed-assets` | cross-link |
| Setup | | |

**Sub-branches**

| Branch | Path | featureCode |
|--------|------|-------------|
| Ledger | `/app/finance/acct-i/journal-entries` | `finance.acct_i` |
| Receivables & payables | `/app/finance/receivables` | `finance.acct_ii` |
| Taxes | `/app/quotation/tax-mngt/tax-types` | `quotation.tax_mngt` |
| Supplier payments | `/app/finance/payment-vouchers` | `finance.payment_vouchers` |

## 26. Data Center (`data_center`)

| Feature | Path |
|---------|------|
| Ingestion rules | `/app/data-center/ingestion-rules` |
| Import inbox | `/app/data-center/inbox` |

## 27. Activity Logs (`activity_logs`)

| Feature | Path |
|---------|------|
| All activity | `/app/activity-logs` |
| Change log | `/app/activity-logs/changes` |

## 28. Help & guides (`documentation`)

| Feature | Path |
|---------|------|
| Help & guides | `/app/documentation` |
| Baiko | `/app/baiko` |

## 29. User Management (`user_management`)

| Feature | Path | featureCode |
|---------|------|-------------|
| Users | `/app/user-management/users` | |
| Roles | `/app/user-management/roles` | |
| Groups | `/app/user-management/groups` | |
| Data scopes | `/app/user-management/user-permissions` | |
| Module & Features | `/app/user-management/tenant-modules` | |
| Process Policies | `/app/user-management/process-policies` | `process_policies` |
| Mapping Center | `/app/user-management/mapping-center` | |
| Migration Center | `/app/user-management/migration-center` | |
| Demo Data | `/app/user-management/demo-data` | |
| Help feedback | `/app/user-management/help-feedback` | |

---

## Platform routes (not in `appModules` list, but required)

| Route | Why it matters |
|-------|----------------|
| `/signin` | Sign-in (Google / demo) |
| `/app/setup` | Workspace setup wizard — blocks selling/buying until foundation complete |
| `/app/dashboard/approvals` | Approvals queue (help/docs reference) |

**Observed:** setup readiness in `api/internal/platform/setupreadiness`; wizard steps in `documentationSections.ts` (`setup-wizard`).

---

## Sync checklist for maintainers

When editing navigation:

1. Change `modules.ts`  
2. Update this inventory table in the same PR  
3. Update the matching `modules/*.md` playbook if purpose/path changed  
4. If a `featureCode` was added, update `05-PROCESS-POLICIES-AND-GATES.md` feature-flag table  
