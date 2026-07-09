# Operations Hub module

Project workspaces with Kanban/table views, calendar and timeline planning, automation rules, dashboards, and ERP document links (quotations, POs, job cost projects).

## Features

| Feature | Web route | API |
|---------|-----------|-----|
| Work Hub (Kanban / table) | `/app/operations` | `GET/POST/PATCH /api/v1/operations/work-items` |
| Calendar | `/app/operations/calendar` | `GET .../work-items?view=calendar&board=1` |
| Timeline | `/app/operations/timeline` | `GET .../work-items?view=timeline&board=1` |
| Dashboards | `/app/operations/dashboard` | `GET/POST /api/v1/operations/dashboards` |
| Automation | `/app/operations/automation` | `GET/POST/PATCH /api/v1/operations/automation-rules` |
| Workspaces | (selector + create) | `GET/POST /api/v1/operations/workspaces` |
| Industry packs | create workspace UI | `GET /api/v1/operations/industry-packs` |
| Create quotation from item | work item action | `POST /api/v1/operations/work-items/{id}/create-quotation` |

## Schema (migration `140_operations_hub.sql`)

- `wm_workspaces` — tenant workspaces with optional `inv_project_id` / `job_cost_project_id`
- `wm_columns` — Kanban columns per workspace
- `wm_work_items` — cards with status, priority, assignee, dates, `quotation_id`
- `wm_links` — generic doc links (`doc_type`, `doc_id`)
- `wm_automation_rules`, `wm_dashboards`, `wm_dashboard_widgets`

Migration `141_operations_crm_mirror.sql` adds `legacy_crm_task_id` on `wm_work_items` for CRM follow-up dual-read.

## CRM mirror

CRM follow-up tasks (`crm_follow_up_tasks`) are mirrored to Operations work items. PATCH from either surface updates both. See in-app KB article `crm-operations-tasks-sync`.

## Board API notes

- Board fetches use `?workspace_id=N&board=1&pageSize=200` (required `workspace_id`).
- Assignee display uses `users.full_name` (not `display_name`).
- Hosted deploys must apply migrations **136–141** before Operations routes return data.

## Demo data

`api/internal/modules/demodata/sql/seed-demo-operations.sql` creates workspace `demo-riverside-reno` (Construction pack) per demo tenant. Status check: `demo_operations_workspace` on Demo Data screen.

Populate via **User Management → Demo Data** (includes `seed-demo-operations.sql` in script list).

## In-app documentation

| Artifact | Location |
|----------|----------|
| Guide section | `web/src/modules/documentation/documentationSections.ts` → `operations` |
| KB articles | `operations-hub-intro`, `crm-operations-tasks-sync` in `moduleKbArticles.ts` |
| Onboarding track | `operations_hub` in `api/internal/platform/onboarding/tracks.go` |

## Manual test checklist

1. Apply migrations `140`, `141`; enable `operations` module for tenant.
2. Open `/app/operations` — workspace selector loads; empty state offers sample project.
3. Create workspace with industry pack — columns and starter items appear.
4. Drag Kanban card — column and sort order persist; Calendar/Timeline show same items.
5. Create CRM follow-up task — mirrored card appears on Operations board.
6. Demo Data populate — `demo-riverside-reno` workspace and work items present.
