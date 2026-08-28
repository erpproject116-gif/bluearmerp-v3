# Deep dive — CRM (leads, pipeline, warranty, follow-ups)

**Audience:** product owner, sales ops, superadmin  
**Evidence:** Observed — `docs/modules/crm/README.md`, CRM APIs, playbook `06-…`  
**Important:** CRM **does not post stock**. It chases pipeline and links commercial docs.

---

## 1. Screen map

| Feature | Path | Notes |
|---------|------|-------|
| My pipeline / Dashboard | `/app/crm/dashboard` | Summary |
| Leads | `/app/crm/leads` | CRUD + convert |
| Leads dashboard | `/app/crm/leads/dashboard` | |
| Opportunities | `/app/crm/opportunities` | Stages |
| Clients | `/app/crm/clients` | Partner health (read) |
| Follow-up Tasks | `/app/crm/follow-up-tasks` | Board + stages |
| Quote board | `/app/crm/pipelines/quotations` | Same quotes as Quotation module |
| Notifications | `/app/crm/notifications` | In-app |
| Alert Rules | `/app/crm/settings/alert-rules` | managersOnly |
| Warranty UI | `/app/after-sales/warranty` | Canonical UI; API under CRM warranty-assets |

---

## 2. Leads — fields & statuses

### Fields (API)

`lead_name`, `company_name`, `email`, `phone`, `source` (default `manual`), `status`, `partner_id`, `pic_user_id`, `pic_name`, `notes`

### Statuses (Hard enum)

`new` \| `contacted` \| `qualified` \| `lost` \| `converted`

### Handoff → Quotation

`POST /leads/{id}/convert-to-quotation`

| Condition | Effect |
|-----------|--------|
| Needs tax type, currency, location | Hard |
| Creates partner if missing | |
| Creates draft quote `unconfirmed` | |
| Sets lead `converted`; may link opportunities | |

---

## 3. Opportunities — fields & stages

### Fields

`lead_id`, `partner_id`, `title`, `stage`, `expected_value`, `expected_close_date`, `probability` (0–100), `quotation_id`, PIC, notes

### Stages

`prospect` \| `qualification` \| `proposal` \| `negotiation` \| `won` \| `lost`

Link to Quotation via `quotation_id` (no separate “convert to Sales Invoice” endpoint observed).

---

## 4. Clients

Not a separate master — **partner health** over Inventory Partners.

Observed metrics: open AR, credit limit / on hold, open/overdue follow-ups, work items, last activity, health score.

Edit masters in **Stock → Partners**.

---

## 5. Quote board

Computed stages over **`quo_quotations`** (same docs as Quotation list):

| Board stage | Rule |
|-------------|------|
| `won` | progress = completed |
| `expired` | valid_until < today |
| `converted_so` | voucher_status partial/completed |
| `open` | else |

Create/edit lines in Quotation module; board is for chasing. Drag maps some columns to progress only.

---

## 6. Follow-up tasks

### Fields

`task_type`, `stage`, `due_date`, `partner_id`, PIC, optional links (`warranty_asset_id`, `quotation_id`, `sales_id`, `purchase_request_id`), `title`, `notes`, `completed_at`

### Task types

`warranty_follow_up` \| `quote_follow_up` \| `manual`

### Stages

`scheduled` \| `due_soon` \| `overdue` \| `follow_up` \| `forwarded_sales` \| `completed` \| `cancelled` \| `closed`  

Terminal: completed / cancelled / closed.

When Operations enabled: tasks can mirror to `wm_work_items`.

---

## 7. Warranty assets

| Created when | Serial sold + item `warranty_duration_months` > 0 on Sales create (also GR warranty path) |
| Statuses | `active` \| `expired` \| `void` |
| Fields | partner, item, serial_no, sales/line/serial links, start/end, PIC |
| Sync caveat | Sales **update** may not re-sync; use sync-from-sales endpoint |
| POS | Auto warranty from POS checkout — **UNKNOWN / verify** |

Canonical UI: After-Sales → Customer Warranty.

---

## 8. Alerts

Rule types include: warranty_follow_up, quote_expiring, low_stock, quote_unconverted, custom_kpi, reconciliation_gap.  
Daily evaluate job + secret. In-app notifications (email not MVP).

---

## 9. Handoffs summary

| From | To | How |
|------|-----|-----|
| Lead | Quotation | convert-to-quotation |
| Opportunity | Quotation | quotation_id |
| Quote board | Quotation | Same documents |
| Follow-up | Quote / SI / PR / Warranty | Optional FKs |
| Sales / GR | Warranty asset | Sync |
| CRM tasks | Operations | Mirror when enabled |

---

## 10. Compare to sales ops

| Your question | Bluearm |
|---------------|---------|
| Where do we track leads? | CRM Leads |
| Convert lead to quote? | Yes — convert action |
| Same quotes as sales team? | Yes — Quote board |
| Warranty after serial sale? | Warranty assets / After-Sales |
| Does CRM reduce stock? | **No** |
