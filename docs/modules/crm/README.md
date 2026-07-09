# CRM module

Customer relationship management: warranty registry, configurable alerts, in-app notifications, follow-up tasks, quotation pipeline (Table/Kanban), and analytics on existing Quotation / Sales Order / Sales / Inventory data.

## Features (MVP)

| Feature | Web route | API |
|---------|-----------|-----|
| CRM Dashboard | `/app/crm/dashboard` | `GET /api/v1/crm/dashboard/summary` |
| Notifications | `/app/crm/notifications` | `GET /api/v1/crm/notifications` |
| Follow-up Tasks | `/app/crm/follow-up-tasks` | `GET/POST/PATCH /api/v1/crm/follow-up-tasks` |
| Quotation Pipeline | `/app/crm/pipelines/quotations` | `GET /api/v1/crm/pipelines/quotations` |
| Warranty Registry | `/app/crm/warranty-assets` | `GET/PATCH /api/v1/crm/warranty-assets` |
| Customer × Item | `/app/crm/reports/customer-quotations` | `GET /api/v1/crm/reports/customer-quotations-by-item` |
| Item Demand | `/app/crm/reports/item-demand` | `GET /api/v1/crm/reports/item-demand` |
| Conversion Funnel | `/app/crm/reports/conversion` | `GET /api/v1/crm/reports/conversion-funnel` |
| Low Stock | `/app/crm/reports/low-stock` | `GET /api/v1/crm/reports/low-stock` |
| Alert Rules | `/app/crm/settings/alert-rules` | `GET/PATCH /api/v1/crm/alert-rules` |

## Warranty model

1. **Item default** — `inv_items.warranty_duration_months` (0 or null = no tracking).
2. **Per-serial registry** — `crm_warranty_assets` created on **Sales create** when a line has `serial_lot_no` and the item has warranty months > 0.

Manual backfill for existing sales: `POST /api/v1/crm/warranty-assets/sync-from-sales/{sales_id}`.

**MVP limitation:** Sales **update** does not re-sync warranty assets. Use manual sync or create a new sale.

## Dashboard KPIs

Computed live from ERP tables (not cached):

| KPI | Source |
|-----|--------|
| Expired quotations | `quo_quotations.valid_until < today` |
| Quotes expiring (7d) | `valid_until` within 7 days |
| Not converted to SO | `voucher_status = 'none'` |
| Not sold after release | SO lines with release qty minus slip balance > 0 |
| Low stock SKUs | `qty_on_hand < coalesce(location.reorder_level, item.reorder_level)` |
| Top selling / quoted items | Last 90 days from sales / quotation lines |
| Warranty follow-ups due | Assets approaching `warranty_end` per alert rules |
| Unread notifications | Per current user |

## Alerts and notifications

- **Alert rules** (`crm_alert_rules`) — configurable lead time per rule type.
- **Daily evaluator** — `POST /api/v1/crm/jobs/evaluate-alerts` (see Cron below).
- **In-app inbox** — bell in app header + `/app/crm/notifications` (no email in MVP).
- **Dedupe** — `crm_notifications.dedupe_key` prevents duplicate daily spam.

## Table ↔ Kanban

Follow-up Tasks and Quotation Pipeline support **Table | Board** toggle (`ViewModeToggle`). Board view uses `@thisbeyond/solid-dnd`; drag updates stage via PATCH.

See [golden-rules.md](../../golden-rules.md#kanban-and-notification-center).

## Permissions

| Permission | Role column | Access |
|------------|-------------|--------|
| View CRM | `can_view_crm` | Dashboard, reports, tasks, pipeline, notifications |
| Manage alert rules | `can_manage_crm_rules` | PATCH alert rules |

Tenant owners and platform superadmins always have access.

## Cron — daily alert evaluator

Set `CRM_JOB_SECRET` on the API server, then schedule a daily HTTP POST:

```bash
curl -X POST "https://YOUR_API/api/v1/crm/jobs/evaluate-alerts" \
  -H "X-CRM-Job-Secret: $CRM_JOB_SECRET"
```

Optional: `?tenant_id=123` to scope to one tenant.

Idempotent per rule + entity + day via `dedupe_key`.

## Manual test checklist

1. Run migration `018_crm.sql` and `scripts/seed-demo-crm.sql`.
2. Sign in as tenant owner → CRM appears in sidebar; bell shows unread count after running evaluator.
3. CRM Dashboard — KPI tiles load; drill-down links open reports.
4. Create a Sale with `serial_lot_no` on an item with warranty months → warranty asset appears in registry.
5. Follow-up Tasks — switch Table/Board; drag card updates stage.
6. Quotation Pipeline — board shows open / expired / converted stages.
7. Low Stock report — set `reorder_level` on an item below current `qty_on_hand`.
8. Alert Rules — toggle rule off/on (requires `can_manage_crm_rules`).
9. `POST /crm/jobs/evaluate-alerts` with valid secret creates notifications without duplicates on re-run.

## Migrations

- `018_crm.sql` — `crm_*` tables, item warranty/reorder columns, module registry, permissions

## Seeds

- `scripts/seed-demo-crm.sql` — alert rules, item warranty/reorder, low-stock balances, 3 warranty assets, 6 follow-up tasks, 5 notifications

Run order: see [sql-run-order.md](../../runbooks/sql-run-order.md).

### What the seed creates (per DEMO000 + BLUEARM)

| Data | Count / detail |
|------|----------------|
| Alert rules | 5 default rules (warranty, quote, stock, digest) |
| Warranty assets | Sale backfill + 3 standalone serials (active, expiring, expired) |
| Follow-up tasks | 6 tasks across scheduled / due_soon / overdue / completed |
| Notifications | 4 unread + 1 read (bell badge shows 4) |
| Low stock | Printer 00001 qty 3 vs reorder 8 |

## Operations Hub mirror

When the **operations** module is enabled (migration `140`), CRM follow-up tasks are mirrored to `wm_work_items` via `legacy_crm_task_id` (migration `141`). Dragging a card in Operations or updating a task in CRM updates both surfaces.

- In-app help: Knowledge base → `crm-operations-tasks-sync`
- Developer doc: [docs/modules/operations/README.md](../operations/README.md)

## Related modules

- [Operations Hub](../operations/README.md)
- [Communications](../comms/README.md)
