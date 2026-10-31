# AEL-2 gate checklist

**Worklog:** Make parity out of scope. AEL-2 in scope.

| # | Check | Status |
|---|--------|--------|
| (a) | Non-automation ERP paths unchanged (no frozen-module edits this run) | Pass — only ops/crm emit path + UI/docs |
| (b) | In-app notify → Activity Log | Code path: `operations.automation.notify` via audit; Hub link `/app/activity-logs?action_code=operations.automation.notify` now applies filter. **Manual:** create active notify rule + fire booking/CRM event |
| (c) | Signed outbound receive | Code path exists (Hub + worker). **Manual:** active endpoint + external HTTPS receive |
| (d) | Recipe doc | **TBD** — `ael-2-recipe-TBD.md`; B-POINT **not** claimed closed |
| (e) | No Make-parity claims | Hub + Automation copy state BYO Make and limited in-app rules |

## Spike notes

- **Step 6 email:** Pass — reuse `outbox.MailConfigured` + `outbox.DeliverHTMLToMany` (`api/internal/platform/outbox/mail.go`). Implemented as action `email`.
- **Step 7:** Added `crm.alert.created` to `allowedTriggers` and routed via `operations.EmitERPEvent` in `job_evaluator.go` (CRM not frozen).

## Operator follow-ups

1. Name the paid recipe and replace TBD doc; record one live Make/webhook.site proof.
2. Redeploy API so worker + email action + Emit path ship.
3. Smoke (b) and (c) on a tenant after deploy.
