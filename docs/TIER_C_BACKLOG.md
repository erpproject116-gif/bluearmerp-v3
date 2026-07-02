# Tier C Backlog — Module Briefs

One-page briefs for Tier C modules. **MVP shipped** modules are live in the app (enable under User Management → Module & Features). Remaining items document future depth or unstarted work.

**Help & guides:** In-app documentation is in `web/src/modules/documentation/documentationSections.ts`.

---

## Manufacturing

**Status:** MVP shipped (migration 080) — single-level BOM, work order release/complete with backflush.

**Purpose:** Plan and execute production—BOMs, work orders, material consumption, and finished-goods receipt.

**Core entities:** Bill of materials, routing/work centers, production order, material issue, finished goods receipt.

**Dependencies:** Inventory (items, stock movements), optional Sales Order for make-to-order.

**MVP slice:** Single-level BOM, manual work order release, backflush consumption on completion.

**Risks:** Lot/serial trace through WIP; costing method alignment with finance.

**Still deferred:** Multi-level BOM, routing, in-process QC integration.

---

## HR / Payroll

**Status:** MVP shipped (migration 083) — employee list, payroll run, payslip stub, accrual JE.

**Purpose:** Employee master, attendance, leave, and payroll runs with statutory deductions.

**Core entities:** Employee, department assignment, pay period, payslip, deduction rules.

**Dependencies:** User management (optional link), Finance (journal posting for payroll).

**MVP slice:** Employee list, monthly payroll batch, payslip PDF, GL expense accrual stub.

**Risks:** Local tax/regulatory variance; PII and access control.

**Still deferred:** Country-specific tax tables, attendance/leave modules.

---

## POS (Point of Sale)

**Status:** MVP shipped (migration 082) — web POS session, cart, cash checkout, shift close.

**Purpose:** Fast retail checkout, cash drawer, and end-of-day settlement.

**Core entities:** POS session, cart, payment tender, Z-read / shift close.

**Dependencies:** Inventory, Sales (invoice or simplified receipt), Finance (cash account).

**MVP slice:** Web POS for walk-in sales, barcode scan, cash/card tender, shift summary.

**Risks:** Offline mode; hardware integration (receipt printer, scanner).

**Still deferred:** Offline mode, hardware printers/scanners, card gateway integration.

---

## Fixed Assets

**Status:** MVP shipped (migration 078) — asset register, straight-line monthly depreciation, posted JE.

**Purpose:** Register capital assets, depreciation schedules, and disposal.

**Core entities:** Asset register, depreciation book, depreciation run, disposal.

**Dependencies:** Finance (chart of accounts, journal entries).

**MVP slice:** Asset master, straight-line monthly depreciation, posted JE on run.

**Risks:** Multi-book depreciation; asset transfer between branches.

**Still deferred:** Multi-book, disposal workflow, asset transfers.

---

## Projects (Job Costing)

**Status:** MVP shipped (migration 079, module `job_costing`) — budget, timesheets, budget vs actual.

**Purpose:** Job costing and project P&L—distinct from inventory “Projects” dimension.

**Core entities:** Project budget, timesheet, expense allocation, project billing.

**Dependencies:** Inventory projects dimension, Sales, Finance.

**MVP slice:** Project budget vs actual from tagged transactions; simple timesheet entry.

**Risks:** Overlap with existing `inv_projects` naming; scope creep vs CRM opportunities.

**Still deferred:** Project billing engine, automatic actuals from all document types.

---

## Support / Helpdesk

**Status:** MVP shipped (migration 074–075) — ticket list, status workflow, comments, warranty/repair links, outbox email stub.

**Purpose:** Customer tickets, SLA, and agent assignment after sale.

**Core entities:** Ticket, category, priority, SLA policy, comment thread.

**Dependencies:** CRM (customer), After-Sales (repair orders), optional Portal.

**MVP slice:** Ticket list, status workflow, email-on-create stub, link to warranty asset.

**Risks:** Notification volume; integration with external mail/helpdesk tools.

**Still deferred:** Full SLA engine, SMTP delivery, external helpdesk sync.

---

## Quality (QMS)

**Status:** MVP shipped (migration 081, 101) — GR inspection hold/release, NCR log, **CAPA web UI** (`/app/quality/capa`).

**Still deferred:** Inspection templates, photo attachments, in-process MFG QC, CAPA ↔ NCR workflow.

---

## Customer / Vendor Portal

**Status:** MVP shipped (migration 084) — magic-link login, read-only orders/invoices/tickets.

**Purpose:** External users view orders, invoices, tickets, and upload documents.

**Core entities:** Portal user, invitation, scoped document list, payment status.

**Dependencies:** Auth (separate portal realm), Sales, Finance, Support.

**MVP slice:** Read-only order and invoice list for invited customers; magic-link login.

**Risks:** Security boundary vs internal ERP; branding per tenant.

**Still deferred:** Vendor portal, document upload, payments, per-tenant branding.

---

## Ad-hoc BI (R9)

**Status:** MVP shipped (migration 085) — saved views on catalog reports, export proxy.

**Purpose:** Self-service reports and exports beyond fixed module reports—filters, saved views, CSV/Excel.

**Core entities:** Report definition, saved filter set, scheduled export (future).

**Dependencies:** Stable read APIs per module, permission matrix, optional warehouse/read replica.

**MVP slice:** Report builder UI over existing list/report endpoints; save named views per user; CSV export.

**Risks:** Query performance on large tenants; SQL injection if custom SQL is allowed—prefer API-bound fields only.

**Note:** Report catalog and finance read APIs (Trial Balance, GL, P&L, BS) ship in Tier B/R. Scheduled email uses outbox stub (migration 077).

**Still deferred:** Interactive report builder UI, read replica. Scheduled email delivery uses SMTP when `SMTP_HOST` and `SMTP_FROM` are set.

---

## ECOUNT gap closure (migrations 086–101)

| Area | Status | Migration |
|------|--------|-----------|
| Mapping Center / doc generation | Shipped (PR→PO, Quotation→SO, SO→Sales/DR, GR→Supplier Invoice) | 086 |
| Universal approvals + pending email (SMTP outbox) | Shipped | 087–088 |
| Company budget | Shipped (opt-in module, block mode on PR/PO) | 089–090 |
| Data Center ingestion | Shipped (opt-in module) | 091 |
| Shipping orders / delivery trips / **freight rules** | Shipped (rules UI, auto flat freight) | 092–093, 095, 103 |
| WMS scheduled receipt | Shipped (opt-in module) | 094 |
| Acct II: withholding / checks / notes / landed cost / contracts | Shipped (API + web UI; PV check/WHT on create; landed cost Post) | 096–100, 102 |
| Sales commission / CAPA / vendor portal | Shipped (commission rules UI, CAPA UI) | 101 |

---

## Not started (no MVP)

| Area | Notes |
|------|--------|
| Full ECOUNT menu parity | Out of scope |
| Groupware suite | Use approvals queue + dashboard instead |

---

## How to use this document

1. Use Help & guides in the app for operator workflows on shipped modules.
2. Enable modules per tenant under User Management → Module & Features.
3. Extend MVP before starting greenfield items in the “Not started” table.
