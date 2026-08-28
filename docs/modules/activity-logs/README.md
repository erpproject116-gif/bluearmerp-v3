# Activity Logs

Tenant audit trail and change log.

**Permissions:** `activity_logs.logs`, `activity_logs.changes` (+ role `can_view_activity_logs`). Member seed defaults deny.

**Retention:** No tenant `audit_logs` purge job in API today (platform retention job is subscription/CRM, not audit).

**Routes:** `/app/activity-logs`, `/app/activity-logs/changes`

**Plain-language playbook:** [Notion pack — Admin](../../notion-knowledge-base/modules/09-admin-platform.md)

**API:** `api/internal/modules/activitylog/`
