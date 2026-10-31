# Named paid workflows (Step 1 / B-POINT)

**Status:** Named 2026-10-31 — B-POINT recipes closed for Path B MVP (not a claim that engine is live in production).  
**Owner:** Bluearm product (erpproject116)  
**Engine:** Activepieces (see `workflows-path-b-decisions.md`)

## R1 — Booking created → Slack (or team chat webhook)

| Field | Value |
|-------|--------|
| Trigger | `booking.created` (Bluearm outbound signed webhook) |
| Steps | Filter event → HTTP to Slack incoming webhook (or Teams) |
| Bluearm writeback | None |
| Success metric | Delivery row `delivered` + message appears in channel within 2 minutes |
| Who pays | Tenant Slack workspace + Bluearm Workflows entitlement |

## R2 — Booking created → CRM follow-up task

| Field | Value |
|-------|--------|
| Trigger | `booking.created` |
| Steps | Map payload → `POST /api/v1/platform/workflows/actions/crm.create_follow_up` with `Idempotency-Key` |
| Bluearm writeback | Creates `crm_follow_up_tasks` row (title from booking) |
| Success metric | Follow-up visible under CRM → Follow-up Tasks; second identical delivery does not duplicate (idempotent) |
| Who pays | Bluearm Workflows entitlement |

## R3 — CRM alert created → external notify

| Field | Value |
|-------|--------|
| Trigger | `crm.alert.created` |
| Steps | Filter → Slack/email HTTP action in Activepieces |
| Bluearm writeback | None (alert already in CRM notifications / optional B-MAIL) |
| Success metric | Delivery row + external notify received |
| Who pays | Tenant notify channel + Bluearm Workflows entitlement |

## Out of recipe set (this MVP)

- SMS, funnels, Listmonk/Mautic drips (Step 8 deferred)
- Sales/inventory package events (frozen; no B1 waiver)
