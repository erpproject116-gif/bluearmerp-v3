# Notion import guide

**Audience:** developers, superadmins, product owner  
**Pack location:** `docs/notion-knowledge-base/`  
**Evidence standard:** every status, gate, and handoff is tagged. If unknown, it says **UNKNOWN** — never invented.

## How to paste into Notion

1. Create a parent page: **Bluearm ERP — Product knowledge base**.
2. Create child pages matching the file numbers below (or import each `.md` via Notion → Import → Markdown).
3. Mermaid blocks: Notion does not render Mermaid natively. Options:
   - Keep as code blocks for developers, or
   - Paste the same diagrams into [mermaid.live](https://mermaid.live) → Export PNG → embed image.
4. Callouts: lines starting with `>` become Notion quotes; convert key ones to Callout blocks manually.
5. Tables paste cleanly from Markdown.

## Product-owner-first tree (preferred)

Publish with **Notion MCP** (or Import) in this order. Pin **Start here** as the home page.

| Order | Audience | Page | File |
|------:|----------|------|------|
| 0 | **PO home** | Start here — Product owner guide | `00-START-HERE-PRODUCT-OWNER.md` |
| 0b | **PO deep** | Sell Quote→Receipt (statuses + handoffs) | `13-DEEP-SELL-QUOTE-TO-RECEIPT.md` |
| 0c | **PO deep** | Buy Request→Receive (statuses + handoffs) | `14-DEEP-BUY-REQUEST-TO-RECEIVE.md` |
| 0d | **PO deep** | Inventory / Serial / Movements | `15-DEEP-INVENTORY-SERIAL-MOVEMENTS.md` |
| 0e | **PO deep** | Accounting forms (OR/SI/PV/JE) | `16-DEEP-ACCOUNTING-FORMS.md` |
| 0f | **PO catalog** | Forms & fields hub (all modules) | `17-FORMS-FIELDS-CATALOG.md` |
| 0f1 | **PO catalog** | Forms pack — index + screen matrix | `forms/00-INDEX.md` |
| 0f2 | **PO catalog** | Form Settings registry (19 entities) | `forms/01-FORMFIELDS-REGISTRY.md` |
| 0f3 | **PO catalog** | Line columns | `forms/02-LINE-COLUMNS.md` |
| 0f4–0f9 | **PO catalog** | Sell / Buy / Inventory / Accounting / POS-CRM / Ops-HR-Admin windows | `forms/03`–`08-*.md` |
| 0f10 | **PO catalog** | Serial & Lot windows | `forms/09-SERIAL-LOT-WINDOWS.md` |
| 0f11 | **PO catalog** | Chart of accounts + mappings | `forms/10-CHART-OF-ACCOUNTS.md` |
| 0f12 | **PO how-to** | Guided navigation & Load Slip shortcuts | `forms/11-GUIDED-NAVIGATION-SCENARIOS.md` |
| 0f13 | **PO how-to** | Form submission errors (prevent & fix) | `forms/12-FORM-SUBMISSION-ERRORS.md` |
| 0f14 | **PO how-to** | Load Slip carry-over & attachments | `forms/13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md` |
| 0f15 | **PO how-to** | Interview — what feels implemented wrong | `forms/14-PO-INTERVIEW-WRONG-IMPLEMENTATION.md` |
| 0g | **PO deep** | POS terminal & shifts | `18-DEEP-POS.md` |
| 0h | **PO deep** | CRM leads & pipeline | `19-DEEP-CRM.md` |
| 1 | PO | Company journey | `03-COMPANY-JOURNEY.md` |
| 2 | PO | Master inventory | `02-MASTER-INVENTORY.md` |
| 3 | PO | Cross-module handoffs | `04-CROSS-MODULE-HANDOFFS.md` |
| 4 | PO | Process policies & gates | `05-PROCESS-POLICIES-AND-GATES.md` |
| 5 | PO | Module playbooks (folder) | `modules/*.md` |
| 6 | PO (as needed) | Gap register | `06-GAP-REGISTER.md` |
| — | Engineering | Master plan, sources, permissions, pass addenda | `01`, `07`–`12`, this guide |

## Full file list (engineers / MCP publish)

| Order | Page | File |
|------:|------|------|
| 0a | Start here (PO) | `00-START-HERE-PRODUCT-OWNER.md` |
| 0b | Import guide (this page) | `00-NOTION-IMPORT-GUIDE.md` |
| 1 | Master plan (how we keep this true) | `01-MASTER-PLAN.md` |
| 2 | Master inventory (every module & feature) | `02-MASTER-INVENTORY.md` |
| 3 | Company journey (start → finish) | `03-COMPANY-JOURNEY.md` |
| 4 | Cross-module handoffs | `04-CROSS-MODULE-HANDOFFS.md` |
| 5 | Process policies & gates | `05-PROCESS-POLICIES-AND-GATES.md` |
| 6 | Gap register (honest unknowns) | `06-GAP-REGISTER.md` |
| 7 | Source index | `07-SOURCE-INDEX.md` |
| 8 | P0 closure addendum | `08-P0-CLOSURE-ADDENDUM.md` |
| 9 | Route → permission matrix | `09-PERMISSIONS-ROUTE-MATRIX.md` |
| 10 | Pass 2 addendum | `10-PASS2-ADDENDUM.md` |
| 11 | Pass 3 addendum | `11-PASS3-ADDENDUM.md` |
| 12 | Pass 4 addendum | `12-PASS4-ADDENDUM.md` |
| 13 | Deep dive — Sell Quote→Receipt | `13-DEEP-SELL-QUOTE-TO-RECEIPT.md` |
| 14 | Deep dive — Buy Request→Receive | `14-DEEP-BUY-REQUEST-TO-RECEIVE.md` |
| 15 | Deep dive — Inventory / Serial / Movements | `15-DEEP-INVENTORY-SERIAL-MOVEMENTS.md` |
| 16 | Deep dive — Accounting forms | `16-DEEP-ACCOUNTING-FORMS.md` |
| 17 | Forms & fields catalog (hub) | `17-FORMS-FIELDS-CATALOG.md` |
| 17a–h | Forms pack (all screens/fields) | `forms/*.md` |
| 18 | Deep dive — POS | `18-DEEP-POS.md` |
| 19 | Deep dive — CRM | `19-DEEP-CRM.md` |
| — | Module playbooks (folder) | `modules/*.md` |

## Reading rules (all audiences)

| Tag | Meaning |
|-----|---------|
| **Observed** | Seen in repo this pack (path cited) |
| **Doc-backed** | Stated in `docs/modules` or ADR; consistent with code where checked |
| **UNKNOWN** | Not verified in code/docs — do not treat as product truth |
| **Relaxed in API** | Policy flag exists but validator currently returns nil (gap) |

## Maintenance rule

When `web/src/shell/modules.ts` changes, update `02-MASTER-INVENTORY.md` in the same PR. When a status or gate changes in API, update the matching module playbook + gap register.
