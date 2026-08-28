# POS · CRM · After-Sales · Quality · Support · Booking

Deep: `../18-DEEP-POS.md`, `../19-DEEP-CRM.md` · Playbook `modules/06`, `modules/08`

None of these (except Repair Order) are in Form Settings `standardRegistry`. CRM constants exist but **no cog**.

---

## POS

### Terminal — `/app/pos`

| | |
|--|--|
| **Kind** | transaction · draft `pos_order_ui` |
| **Happy path** | Open shift → cart (+ serials) → Checkout → Close shift |
| **Open shift*** | location*, opening_cash* → status **open** |
| **Checkout** | creates **completed** Sales Invoice + stock down when tracked · serial count = qty HARD |
| **Close shift** | closing_cash → **closed** |
| **Session statuses** | `open` \| `closed` only · one open session per cashier |
| **Hard gates** | Foundation ready · session open · stock available · serial count = qty |
| **Permissions** | pos.terminal · pos.sessions · pos.checkout · pos.manage |

### Manage — `/app/pos/manage` (managersOnly)

Catalog, categories, default location, tax, tenders, order types, auto-post SI/OR, privilege %, branding, modifiers, logs — exhaustive field list **UNKNOWN**.

---

## CRM

### Leads — `/app/crm/leads` · draft `crm_lead`

| Fields | lead_name, company, email, phone, source (default manual), status, partner_id, PIC, notes |
| Statuses | new \| contacted \| qualified \| lost \| converted |
| Convert | Needs tax + currency + location HARD → draft Quotation + partner; sets converted |
| Stock | None |

### Opportunities — `/app/crm/opportunities` · draft `crm_opportunity`

| Fields | lead_id, partner_id, title, stage, expected_value/close_date, probability 0–100, quotation_id, PIC, notes |
| Stages | prospect → qualification → proposal → negotiation → won / lost |

### Clients — `/app/crm/clients`

Read-only partner health (AR, credit/hold, follow-ups, score). Edit masters in Stock → Partners.

### Follow-up Tasks — `/app/crm/follow-up-tasks`

| Types | warranty_follow_up \| quote_follow_up \| manual |
| Stages | scheduled → due_soon → overdue → follow_up → forwarded_sales → completed / cancelled / closed |
| Fields | type, stage, due_date, partner, PIC, optional warranty/quote/sales/PR links, title, notes |
| May mirror | Operations work items |

### Quote board — `/app/crm/pipelines/quotations`

Same documents as Quotation. Computed stages: open / expired / converted_so / won.

### Alert Rules — `/app/crm/settings/alert-rules` (managersOnly)

Types include warranty_follow_up, quote_expiring, low_stock, quote_unconverted, custom_kpi, reconciliation_gap — rule field depth **UNKNOWN**.

### Dashboards / Notifications

`/app/crm/dashboard`, `/app/crm/leads/dashboard`, `/app/crm/notifications` — hubs/boards.

---

## After-Sales

### Repair Orders — `/app/after-sales/repair-orders` · `inv_repair_order` · Form Settings **Yes**

Full header fields: `01-FORMFIELDS-REGISTRY.md`  
Statuses (doc): received \| diagnosing \| repairing \| awaiting_parts \| finished \| released

### Customer Intake — `/app/after-sales/register-repair`

Statuses: open \| converted \| closed · Convert → RO blocked if already converted · fields UNKNOWN depth

### Intake Status / Parts Consumption / RO Status

Report/status boards under register-repair and repair-orders — no primary form.

### Customer Warranty — `/app/after-sales/warranty` · `crm_warranty_asset`

| Fields | partner, item, serial_no, sales/line/serial links, start/end, PIC |
| Statuses | active \| expired \| void |
| Create | When serial sold + warranty_months > 0 |
| POS auto-sync | **verify** (UNKNOWN) |

---

## Quality — `/app/quality/*`

| Screen | Draft | Statuses / notes |
|--------|-------|------------------|
| NCRs | `qa_ncr` | open \| in_review \| closed · severity minor\|major\|critical · fields UNKNOWN |
| QC Requests | — | e_approval \| unconfirmed \| in_progress \| completed · **held** blocks GR post |
| CAPA | `qa_capa` | default open · no close API observed (doc) |

---

## Support — `/app/support/tickets` · draft `support_ticket`

Statuses: open \| in_progress \| waiting \| resolved \| closed  
May link warranty/RO · category/priority/SLA fields **UNKNOWN**

---

## Booking — `/app/booking/*`

| Screen | Notes |
|--------|-------|
| Bookings | scheduled ↔ confirmed → completed / cancelled / no_show · resource overlap + buffer HARD |
| Resources / Services | config masters — fields UNKNOWN |
| Calendar | board |
| Convert → quote | needs customer + tax/currency |
