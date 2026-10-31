# CRM Workflow MVP templates (Step 7)

Import these into the Bluearm-operated Activepieces instance after Step 2 smoke passes.

Honest naming: **CRM Workflows** templates — not GHL.

| File | Recipe |
|------|--------|
| `R1-booking-to-slack.md` | Booking → Slack |
| `R2-booking-to-follow-up.md` | Booking → Bluearm follow-up action |
| `R3-alert-to-notify.md` | CRM alert → Slack/HTTP |

Each template is a step list an operator can rebuild in Activepieces (CE has no guaranteed portable JSON format across versions — `Unknown` exact export schema this session, so we ship rebuild instructions).
