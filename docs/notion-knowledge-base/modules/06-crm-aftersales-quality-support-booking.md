# Module — CRM, After-Sales, Quality, Support, Booking

> **Deep dive (CRM):** `19-DEEP-CRM.md` (leads, opportunities, quote board, follow-ups, warranty)

## CRM

**Path:** `/app/crm/dashboard`  
**Purpose:** Pipeline, leads, clients, opportunities, follow-ups, quote board, warranty alerts — **does not post stock**.

### Features

My pipeline · Leads dashboard · Notifications · Follow-up Tasks · Leads · Clients · Opportunities · Quote board · Alert Rules (`managersOnly`)

### Follow-up task stages (Observed)

`scheduled`, `due_soon`, `overdue`, `follow_up`, `forwarded_sales`, `completed`, `cancelled`, `closed`

### Who

`can_view_crm`, `can_manage_crm_rules`; owners/superadmins always (**docs**).

### Handoffs

Warranty assets from Sales (and GR warranty on serial path) · Quote board over commercial quotes · Mirrors to Operations work items · Chat mention notifications

### Evidence

`docs/modules/crm/README.md`, `api/internal/modules/crm/`

---

## After-Sales

**Path:** `/app/after-sales/repair-orders`  
**Purpose:** Repair / RMA — not the same as Sales Returns (restock/credit).

### Features

Repair Orders · Status · Customer Intake · Intake Status · Parts Consumption · Customer Warranty

### Repair progress (Observed — G-23)

Repair Order (`inv_repair_orders`, migration `215`):  
`received` \| `diagnosing` \| `repairing` \| `awaiting_parts` \| `finished` \| `released` (default `received`)

Customer Intake / Register Repair (`inv_repair_registrations`, migration `016`):  
`open` \| `converted` \| `closed`

**Convert:** `POST .../repair-registrations/{id}/convert-to-repair-order` → creates RO, sets registration `converted` + `repair_order_id`. Blocked if already converted.

### Happy path (KB-backed)

1. Use RMA location.  
2. Pick from SI / Receive into RMA **or** Customer Intake → convert to Repair Order.  
3. Consume parts.  
4. Progress through diagnosing/repairing/awaiting_parts → finished → released to non-RMA.  
5. Print receipt/warranty; History audit.

### Vs sales return

Restock/credit → Sales Returns. Hold for repair → Repair Order / Intake.

### Evidence

`.cursor/rules/after-sales-repair-order.mdc`, `repair_orders.go`, `repair_registrations.go`, migrations `007`/`215`/`016`, help after-sales section

---

## Quality

**Path:** `/app/quality/ncrs`  
**Features:** NCRs · QC Requests · CAPA

### Flows (Observed)

| Artifact | Status notes |
|----------|--------------|
| GR inspection_status | `pending` \| `held` \| `released` (draft only); **held blocks GR post** |
| NCR (G-15) | DB: `open` \| `in_review` \| `closed` (migration `081`). Patch to `closed` sets `closed_at`. Severity: `minor` \| `major` \| `critical`. |
| QC progress | `e_approval` \| `unconfirmed` \| `in_progress` \| `completed` (API switch validates) |
| CAPA (G-16) | Default `open` on create. **No** DB check constraint. API: **GET list + POST create only** — no update/close endpoint in `capa.go`. `closed_at` column unused by API today. |

### Evidence

`api/migrations/081_quality_qms.sql`, `101_sales_commission_qms_portal.sql`, `quality/*.go`, KB quality articles

---

## Support

**Path:** `/app/support/tickets`  
**Purpose:** Tickets; may link warranty asset / repair order.

### Statuses (Observed)

`open` | `in_progress` | `waiting` | `resolved` | `closed`

Category/priority/SLA: **UNKNOWN**.

### Evidence

`api/internal/modules/support/tickets.go`

---

## Booking

**Path:** `/app/booking/bookings`  
**Features:** Calendar · Bookings · Resources · Services

### Status machine (Observed in `conflict.go`)

`scheduled` ↔ `confirmed` → `completed` / `cancelled` / `no_show`  
cancelled/no_show can return to scheduled  

### Gates

- Resource overlap blocked (service `buffer_minutes`)  
- Convert → quotation needs customer + tax/currency; cancelled cannot convert; one quotation per booking  

### Doc gap (G-31 closed)

Help section `booking` exists in `documentationSections.ts` and is now listed under the **CRM & service** help group (`documentationGroups.ts`).

### Evidence

`api/internal/modules/booking/`, help `booking` section, `documentationGroups.ts`
