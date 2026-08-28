# Source index

Use this to audit any claim in the pack.

## Navigation & shell

| Path | Use |
|------|-----|
| `web/src/shell/modules.ts` | Master module/feature inventory |
| `web/src/shared/moduleAccess.ts` | Feature code enablement |
| `web/src/shared/moduleSetupScopes.ts` | Setup tabs |

## Process & foundation

| Path | Use |
|------|-----|
| `docs/adr/0005-process-flows-and-policies.md` | Policy defaults |
| `api/internal/platform/processpolicy/` | Live policy flags & validators |
| `api/internal/platform/setupreadiness/` | Foundation gate |
| `web/src/modules/setup/SetupWizardPage.tsx` | Wizard UI |
| `web/src/modules/dashboard/onboardingPlaybookData.ts` | Week 1–4 playbook |

## Commercial APIs (spine)

| Path | Use |
|------|-----|
| `api/internal/modules/quotation/` | Quotes |
| `api/internal/modules/salesorder/` | SO + releases |
| `api/internal/modules/deliveryreceipt/` | Delivery notes |
| `api/internal/modules/sales/` | SI, collective, returns, approval |
| `api/internal/modules/purchaserequest/` | PR + approval |
| `api/internal/modules/purchaseorder/` | PO, RFQ, returns |
| `api/internal/modules/goodsreceipt/` | Receive + QC hold |
| `api/internal/modules/finance/` | OR, PV, JE, AP/AR |
| `api/internal/modules/shipping/` | Shipping orders |

## Module docs (existing README density)

| Path | Strength |
|------|----------|
| `docs/modules/quotation/README.md` | Strong |
| `docs/modules/sales-order/README.md` | Strong |
| `docs/modules/sales/README.md` + collective/collections | Strong |
| `docs/modules/purchase-request/README.md` | Strong |
| `docs/modules/inventory/README.md` + serial-lot | Strong |
| `docs/modules/finance/README.md` | Strong |
| `docs/modules/crm/README.md` | Medium |
| `docs/modules/operations/README.md` | Medium |
| `docs/modules/user-management/README.md` | Thin |
| `docs/modules/dashboard/README.md` | Medium |
| `docs/modules/cms/README.md` | Strong |
| `docs/modules/comms/README.md` | Medium |
| `docs/modules/documentation/README.md` | Meta |
| `docs/modules/demo-scenarios/README.md` | Proof chains |

## In-app help

| Path | Use |
|------|-----|
| `web/src/modules/documentation/documentationSections.ts` | Plain-language sections |
| `web/src/modules/documentation/documentationGroups.ts` | Help groups |
| `web/src/modules/documentation/knowledgebaseGroups.ts` | KB groups |
| `web/src/modules/documentation/knowledgebaseArticles.ts` | KB articles |
| `web/src/modules/documentation/moduleKbArticles.ts` | Module KB |
| `web/src/modules/documentation/helpScenarioArticles.ts` | Scenarios |

## Proof scripts

| Path | Use |
|------|-----|
| `docs/modules/demo-scenarios/README.md` | Catalog |
| `scripts/fixtures/demo-scenarios.yaml` | Stable numbers |
| `scripts/verify-demo-full-chain.sql` | Post-seed gate |
| `scripts/seed-demo-golden-scenarios.sql` | Seeds |

## Other modules (API)

| Area | Path |
|------|------|
| CRM | `api/internal/modules/crm/` |
| POS | `api/internal/modules/pos/` |
| HR | `api/internal/modules/hr/` |
| Quality | `api/internal/modules/quality/` |
| Support | `api/internal/modules/support/` |
| Booking | `api/internal/modules/booking/` |
| CMS | `api/internal/modules/cms/` |
| SOP | `api/internal/modules/sop/` |
| OKR | `api/internal/modules/okr/` |
| Operations | `api/internal/modules/operations/` |
| Job costing | `api/internal/modules/jobcosting/` |
| WMS | `api/internal/modules/wms/` |
| Manufacturing | `api/internal/modules/manufacturing/` |
| Fixed assets | `api/internal/modules/fixedassets/` |
| Data center | `api/internal/modules/datacenter/` |
| Activity log | `api/internal/modules/activitylog/` |
| User mgmt | `api/internal/modules/usermgmt/` |
| Comms | `api/internal/platform/comms/` |
| Migration | `api/internal/modules/migration/` |
| Help assistant | `api/internal/modules/helpassistant/` |
| Copilot / Baiko | `api/internal/modules/copilot/` |
| Repair orders | `api/internal/modules/inventory/repair_orders.go` |

## This pack

| Path | Use |
|------|-----|
| `web/src/shared/permissionCodes.ts` | Route → permission matrix |
| `api/internal/modules/docgen/` | Mapping Center generate |
| `api/migrations/086_doc_generation_rules.sql` | Mapping rules table |
| `api/migrations/082_pos.sql` | POS session statuses |
| `api/internal/modules/finance/supplier_invoice_approval.go` | Bill approval |
