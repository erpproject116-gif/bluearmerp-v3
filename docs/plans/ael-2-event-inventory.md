# AEL-2 event inventory (read-only)

Generated from codebase grep 2026-10-31. No code changes in this artifact.

| Event | Emit site | Via `EmitERPEvent`? | In `allowedTriggers`? | Outbound (via Emit / direct)? | Hub filter tip |
|-------|-----------|---------------------|------------------------|-------------------------------|----------------|
| `work_item.created` | `operations/work_items.go` | Yes | Yes | Yes (via EmitERPEvent) | `work_item.*` |
| `work_item.column_changed` | `operations/work_items.go` | Yes | Yes | Yes | `work_item.*` |
| `work_item.status_changed` | `operations/work_items.go` | Yes | Yes | Yes | `work_item.*` |
| `work_item.quotation_created` | `operations/quotation_link.go` | Yes | Yes | Yes | `work_item.*` |
| `workspace.created` | `operations/workspaces.go` | Yes | Yes | Yes | `workspace.*` |
| `booking.created` | `booking/routes.go` | Yes | Yes | Yes | `booking.*` |
| `booking.status_changed` | `booking/routes.go` | Yes | Yes | Yes | `booking.*` |
| `crm.follow_up.created` | `crm/follow_up_tasks.go` | Yes | Yes | Yes | `crm.*` |
| `crm.follow_up.updated` | `crm/follow_up_tasks.go` | Yes | Yes | Yes | `crm.*` |
| `crm.follow_up.stage_changed` | `crm/follow_up_tasks.go` | Yes | Yes | Yes | `crm.*` |
| `crm.alert.created` | `crm/job_evaluator.go` | Yes (after AEL-2 Step 7) | Yes | Yes | `crm.*` |

## Gaps closed in AEL-2 run

- `crm.alert.created` now goes through `EmitERPEvent` + `allowedTriggers`.

## In-app actions (`allowedActions`)

`notify`, `log`, `set_status`, `set_priority`, `email` (via `outbox.DeliverHTMLToMany` when mail configured).

## Signature

Header: `X-Bluearm-Signature: sha256=<hex>` over raw JSON body. Also `X-Bluearm-Event`.
