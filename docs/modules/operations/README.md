# Operations Hub module

Project workspaces with Kanban/table views, calendar and timeline planning, **live automation**, dashboards, **ERP document links**, custom fields, editable boards, and tenant industry packs.

## Features

| Feature | Web route | API |
|---------|-----------|-----|
| Work Hub (Kanban / table) | `/app/operations` | `GET/POST/PATCH /api/v1/operations/work-items` |
| Form settings / custom fields | `/app/operations/work-items/settings` | `/api/v1/custom-fields?entity_type=ops_work_item` |
| Board settings | Hub → Board settings | Column CRUD + workspace PATCH |
| Industry packs | `/app/operations/packs` | `GET/POST/PATCH/DELETE /api/v1/operations/packs` |
| Pack editor | Packs → Edit / View | `PATCH .../packs/{id}` (name, description, columns) |
| Save board as pack | Board settings | `POST .../workspaces/{id}/save-as-pack` |
| Apply pack to board | API | `POST .../workspaces/{id}/apply-pack` |
| Document links | Edit work item | `GET/POST/DELETE .../work-items/{id}/links` |
| Doc search | Link picker | `GET .../doc-search?doc_type=&q=` |
| Calendar (month/week) | `/app/operations/calendar` | `GET .../work-items?board=1` + create/patch |
| Timeline | `/app/operations/timeline` | `GET .../work-items?view=timeline&board=1` |
| Dashboards | `/app/operations/dashboard` | `GET/POST /api/v1/operations/dashboards` |
| Automation | `/app/operations/automation` | `GET/POST/PATCH /api/v1/operations/automation-rules` |
| Workspaces | (selector + create) | `GET/POST/PATCH /api/v1/operations/workspaces` |
| Create quotation from item | work item action | `POST /api/v1/operations/work-items/{id}/create-quotation` |

## Schema

### Migration `140_operations_hub.sql`

- `wm_workspaces`, `wm_columns`, `wm_work_items`, `wm_links`
- `wm_automation_rules`, `wm_dashboards`, `wm_dashboard_widgets`

### Migration `155_operations_board_and_packs.sql`

- Column config: `wm_columns.is_done`, `wip_limit`, `archived_at`
- Pack tables: `ops_packs`, `ops_pack_columns`, `ops_pack_sample_items`, `ops_pack_automation_rules`, `ops_pack_dashboard_widgets`
- Permissions: `operations.packs`, `operations.board_config`

### Migration `156_operations_links_unique.sql`

- Unique `(work_item_id, doc_type, doc_id)` on `wm_links`

Platform packs are seeded from embed JSON into `ops_packs` (`tenant_id` null, `is_system` true) on first pack list. Tenants clone or create custom packs; system packs are read-only.

## Custom fields

Entity type: `ops_work_item`. Configure at Form settings; values save with create/patch work items (`custom_values`).

## Document links

Supported `doc_type` values:

| doc_type | Label |
|----------|-------|
| `quo_quotation` | Quotation |
| `po_purchase_order` | Purchase order |
| `sa_sales` | Sales invoice |
| `fin_official_receipt` | Official receipt |
| `job_cost_project` | Job cost project |

Linking a quotation also sets `wm_work_items.quotation_id` when empty.

## Automation engine

`EmitERPEvent` evaluates active `wm_automation_rules` for the workspace (and tenant-wide rules with null workspace).

| Trigger | When |
|---------|------|
| `work_item.created` | New work item |
| `work_item.column_changed` | Column move (drag or edit) |
| `work_item.status_changed` | Status patch |
| `work_item.quotation_created` | Create quotation from item |

| Action | Behavior |
|--------|----------|
| `notify` / `log` | Activity Log entry (`operations.automation.*`) |
| `set_status` | Updates work item status |
| `set_priority` | Updates work item priority |

Optional `trigger_config` filters: `column_id`, `column_key` / `to_column_key`, `status`.

## Board configuration

- Add / rename / reorder / mark done / archive columns after workspace create
- Soft-archive columns (cannot remove last active column)
- Archive workspace via status `archived`
- **Save board as pack** snapshots active columns into a tenant pack

## Industry packs

| Action | Behavior |
|--------|----------|
| List | Platform + tenant packs (`GET /packs`) |
| Clone | Copy system/tenant pack into tenant-owned pack |
| Create blank | Minimal 3-column custom pack |
| **Edit pack** | Tenant packs: rename, description, add/reorder/remove columns, colors, done flag |
| View pack | System packs: read-only column preview (clone to customize) |
| Save as pack | From current workspace columns |
| Apply | `add_missing_columns` (safe) or `replace_empty_only` (no work items) |

Workspace create accepts `industry_pack` (code) and/or `pack_id`.

## Calendar

Month and week grids on `/app/operations/calendar`. Click a day or **+ Task** to create a work item with title, description, dates, and column. Events are the same `wm_work_items` as the Kanban board (date-based for now; timed slots + reminder delivery are a follow-up).

## CRM mirror

CRM follow-up tasks (`crm_follow_up_tasks`) are mirrored to Operations work items. See KB `crm-operations-tasks-sync`.

## Demo data

`api/internal/modules/demodata/sql/seed-demo-operations.sql` creates workspace `demo-riverside-reno` (Construction pack).

## Manual test checklist

1. Apply migrations through **156**; enable `operations` module.
2. Open `/app/operations` — create workspace with pack → columns appear.
3. **Board settings** — rename/add/reorder/archive columns; save as pack.
4. `/app/operations/packs` — clone Construction → **Edit pack** (rename columns) → create workspace from clone.
5. **Form settings** — add a custom field; create/edit work item and confirm value persists.
6. Edit work item → **Linked documents** — search and link a quotation/PO/SI/OR/job cost.
7. `/app/operations/calendar` — month/week views; click a day to add a dated task; confirm it appears on the hub board.
8. Drag Kanban card with an automation rule on `work_item.column_changed` → Activity Log (or status/priority update).
9. CRM follow-up still mirrors to board.
