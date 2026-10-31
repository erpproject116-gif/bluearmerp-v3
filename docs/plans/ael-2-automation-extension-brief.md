# Automation Extension Level AEL-2 — working brief

**Status:** In progress (2026-10-31)  
**Worklog:** Full Make/n8n/Activepieces parity is **out of scope**. **AEL-2** is in scope.

## Non-goal

Bluearm is **not** an iPaaS. Do not claim Make/n8n/Activepieces parity in UI, docs, or marketing.

## Goal (AEL-2)

Keep all existing ERP modules. Workflow & automation is an **optional extension**:

| Capability | AEL-2 requirement |
|------------|-------------------|
| In-app rules | Operations → Automation on booking / CRM / ops triggers; notify/log visible in Activity Log |
| External reach | BYO Make/Zapier/n8n Cloud via Outbound webhooks (signed `X-Bluearm-Signature`) |
| Discoverability | Event catalog on Hub; honest copy that in-app ≠ Make |
| Recipe | Named paid workflow doc — or honest **TBD** if owner has not named one |

## AEL-2 acceptance checklist

- [x] (a) Non-automation ERP paths unchanged for tenants who ignore automation (no frozen-module edits)
- [ ] (b) In-app notify rule → Activity Log shows `operations.automation.notify` (or `.log`) — **code ready; manual after deploy**
- [ ] (c) Active outbound endpoint → external URL can receive signed JSON — **code ready; manual after deploy**
- [x] (d) Recipe doc exists titled **TBD** (B-POINT not claimed closed) — `ael-2-recipe-TBD.md`
- [x] (e) No Make-parity claims in Hub / Automation / recipe docs

## Out of scope (reminder)

Hosting/embedding glue engines; connector library; frozen ERP package edits without B1 waiver; new mail stack; `wm_automation_runs` unless Activity Log unusable.
