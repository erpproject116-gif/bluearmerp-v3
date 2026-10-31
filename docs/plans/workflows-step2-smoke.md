# Step 2 — production smoke (AEL-2 egress)

**Status:** **NOT PASSED in this implementation session** — requires operator credentials against production.

## Required checks

1. **Notify → Activity Log**  
   - Create active Operations Automation rule: trigger any live event (e.g. `booking.created`), action `notify`.  
   - Fire the event.  
   - Open `/app/activity-logs?action_code=operations.automation.notify` and confirm a row.

2. **Outbound signed receive**  
   - User Management → Outbound webhooks → endpoint Active, filter `booking.*` or `crm.*`.  
   - Point at a catch URL you control.  
   - Fire event → confirm `X-Bluearm-Signature: sha256=…` and a delivery row status delivered/success.

## Gate

Steps 5–7 may ship **code and docs** in “setup mode.”  
**Production engine cutover** (setting `VITE_WORKFLOWS_ENGINE_URL` / enabling live templates) **must wait** until both checks above pass and are recorded here by an operator.

### Operator log

| Check | Pass? | Date | Who |
|-------|-------|------|-----|
| Notify → Activity Log | _pending_ | | |
| Outbound signed receive | _pending_ | | |
