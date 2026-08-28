# After-Sales

Repair orders, customer intake, parts consumption, warranty.

| Entity | Statuses |
|--------|----------|
| Repair order progress | `received`, `diagnosing`, `repairing`, `awaiting_parts`, `finished`, `released` |
| Customer intake | `open`, `converted`, `closed` |

**Convert:** intake → `POST .../convert-to-repair-order`

**Plain-language playbook:** [Notion pack — CRM & service](../../notion-knowledge-base/modules/06-crm-aftersales-quality-support-booking.md)

**API:** `repair_orders.go`, `repair_registrations.go` · Migrations `007`, `016`, `215`
