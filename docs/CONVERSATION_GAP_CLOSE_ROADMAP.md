# Conversation Gap-Close Roadmap

Master plan for threads discussed after the HRIS gap-close. **Defaults locked** (user said proceed without A/B answers):

| Topic | Default |
|-------|---------|
| Hospitality | Restaurant POS profile + hotel/rooms via Booking; **property listings parked** |
| Agency | **Tenant-per-client** + signed handoffs (not B2 multi-client-in-one-tenant) |
| Owner alerts | In-app bell + **hourly email digest** |
| Booking calendar | Shared date/layout helpers; Booking week/day/month view |
| Evaluations | Signature canvas → PNG on acknowledge → 201 artifact |

## Phase 1 — Trust & visibility (ship first)

1. **Owner change alerts** — prefs + queue + hourly digest job; include `booking.` in notify prefixes.
2. **Booking trust** — `audit.Log` on create/update; resource conflict detection honoring `buffer_minutes`; status transition rules.
3. **Booking calendar** — shared calendar date utils + Booking calendar route/nav.
4. **Evaluation signature** — canvas PNG + signed name on ack; store signed copy in 201.

## Phase 2 — Vertical polish

5. **POS restaurant profile** — one-click ui_labels preset (table/covers language); optional booking_id on saved bill later.
6. **Agency ops** — document tenant-per-client playbook; ESS/manager signed handoff polish (reuse signature pad).

## Phase 3 — Productize

7. Docs/KB/nav truth; backlog honesty (no SCORM, no certified BIR eFPS, no DOLE-legal claims).
8. Parked: property listings marketplace, multi-resource waitlist, deposits, full PMS.

## Explicit non-goals (this roadmap)

- SCORM LMS, certified BIR eFPS gateway, counsel-certified DOLE letters.
- Parent-org + `client_id` agency schema.
- Property listing / real-estate MLS module.

## Verification

- Apply migrations `193`, `196`, `197+` on each environment.
- Cron: `POST /api/v1/platform/jobs/change-alert-digest` with job secret (when configured).
- Manual: create overlapping booking → conflict; acknowledge review with signature → 201 doc; change inventory → digest queue row.
