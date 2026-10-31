# Unified plan — freeze & gaps (2026-10-31)

**Status:** Step 0–1 acceptance artifact. Not a claim that Tracks 2–10 are Done.

## Step 0 — Freeze decisions

| Decision | Value |
|----------|--------|
| System of record | Bluearm ERP (Go API + SolidJS + Supabase) |
| GHL / second ERP | **Skip** adopting GoHyperLevel, Aperture, Odoo, ERPNext, Twenty, Krayin/Espo/Suite/Dolibarr as replacements |
| Glue engine | At most **one** of n8n **or** Activepieces — only after webhook approval (**Defer** until B-HOOK) |
| Rules engine | Extend `wm_automation_rules` + CRM alert rules only — **no** second engine; Windmill not default |
| Commercial bridges | Call-only: lead convert-to-quotation, booking to-quotation, ops create-quotation — **no** quotation package redesign |
| Baiko locks | Approve-before-write; no Zapier agents; no arbitrary HTTP/SSRF; orchestration stays in Go |
| Open WebUI | **Abort** until product waives “No second Python service” (**B-OWUI-1**) |
| Point tools | Chatwoot, cal.diy, Listmonk, Documenso, Formbricks, Typebot — **Defer** until named paid workflow |
| Migration | Lane A = Migration Center; Lane C = attachment vault (design blocked on storage); Data Center Generate **not** cutover |
| OSS dossier | Agent-store research only; not a build backlog dump |

### Glossary

| Name | Meaning |
|------|---------|
| Operations Automation | `/app/operations/automation` — `wm_automation_rules` |
| Baiko | `/app/baiko` — grounded Ask / approve-to-act |
| Baiko Studio (Open WebUI) | Optional sidecar — **not** approved this run |
| Scheduled prompts | Open WebUI feature — **≠** Operations Automation |

### Blockers (open)

| Id | Blocker |
|----|---------|
| B-HOOK | **Cleared (2026-10-31 finish)** — outbound webhook API shipped; n8n/AP remain external |
| B-MAIL | **Cleared** — CRM alert email via outbox when mail configured |
| B-OWUI-1 | **Cleared for external OWUI only** — no Python inside Go API; adapter shipped |
| B-OWUI-2 | **Cleared** — `/copilot/openai/v1/*` adapter |
| B-MIG | **Cleared for Lane C local disk** — vault API; Lane B history policy still archive-only by design |
| B-POINT | **Open** — no named paid workflows; wiring docs only (see `unified-integrations-finish.md`) |

### Do-not-touch (frozen modules)

`inventory`, `quotation` (internals), `sales`, `salesorder`, `selling`, `purchaserequest`, `purchaseorder`, `buying`, `goodsreceipt`, `finance`, `manufacturing`, `wms`, `shipping`, `pos`.

---

## Step 1 — Gaps (≤12) and track order

**Default order (owner silent):** CRM/Booking automation emits → Ops UI triggers → (Baiko booking read if In) → Defer hooks/points/OWUI/migration vault.

| # | Gap | Module | Evidence | Status | Acceptance |
|---|-----|--------|----------|--------|------------|
| 1 | Ops automation has no CRM/booking triggers; booking/CRM never call `EmitERPEvent` | Ops + Booking + CRM | `allowedTriggers` work_item-only; grep booking/crm Emit = empty | **In** | Create rule on `booking.created` / `crm.follow_up.created`; create entity → Activity Log notify/log |
| 2 | Automation UI omits `workspace.created` and any CRM/booking triggers | Ops web | `OperationsAutomationPage.tsx` options | **In** | Dropdown lists new triggers + workspace.created |
| 3 | Tenant-wide events must not fire workspace-scoped rules | Ops | `events.go` filter when `workspace_id` absent | **In** | Events without workspace_id only match `workspace_id is null` rules |
| 4 | CRM alert email | CRM | README in-app only | **Defer** | B-MAIL |
| 5 | Baiko booking read tool | Baiko | No booking tool in `tools.go` | **In → Done** | `list_upcoming_bookings` + ask routing; tests green |
| 6 | Outbound signed webhooks + n8n\|Activepieces | Platform | No generic outbound webhooks | **Done** | Webhook API + Emit; glue apps external |
| 7 | Chatwoot / cal.diy / Listmonk / Documenso / Formbricks / Typebot | Integrations | Dossier Integrate-later | **Docs only** | B-POINT — need named workflow to embed |
| 8 | Open WebUI sidecar | AI | copilot.md no second Python service | **Adapter Done** | OWUI container optional external; `/app/baiko` stays |
| 9 | Migration job logs / serial opening / reconcile UI | Migration | Migration Center limits | **Partial** | Checklist + vault; job logs / serial kind still deferred |
| 10 | Attachment vault (Lane C) | Migration | No mig attachment kind | **Done** | Local disk vault + checksum manifest |
| 11 | Data Center Generate → real entities | Data Center | Stub generate | **Out** | Not cutover path |
| 12 | Thin email drip / lead scoring | CRM | No campaign engine | **Defer** | Needs product In + B-MAIL clarity |

**This run implements:** gaps **1–3** only. All else Defer/Abort/Out.

---

## Step 10 — This-run regression / handoff (2026-10-31)

### Done (acceptance)

| Step | Result |
|------|--------|
| 0 Freeze | This document |
| 1 Gaps | Table above; In = #1–3 |
| 2–3 CRM/Booking | Emit `crm.follow_up.*` / `booking.*` into ops automation (no quotation package edits) |
| 4 Ops | New `allowedTriggers` + tenant-wide-only match when no `workspace_id` + Automation UI options |
| 5 Baiko | **Done** — `list_upcoming_bookings` (read-only) |
| 6 Webhooks / n8n\|AP | **Defer** (B-HOOK) |
| 7 Point tools | **Defer** (B-POINT) |
| 8 Open WebUI | **Abort** (B-OWUI-1) |
| 9 Migration | **Partial** — Lane A checklist on Migration Center; vault/job logs still **Defer** (B-MIG) |
| 10 Tests | ops/booking/crm + `./internal/modules/copilot/` — pass |

### Files touched by this task only

- `api/internal/modules/operations/{automation_rules.go,events.go,automation_triggers_test.go}`
- `api/internal/modules/booking/routes.go`
- `api/internal/modules/crm/follow_up_tasks.go`
- `api/internal/modules/copilot/{tools.go,ask.go,ask_test.go,toolcache.go,routes.go}`
- `web/src/modules/operations/OperationsAutomationPage.tsx`
- `web/src/modules/migration/MigrationCenterPage.tsx`
- `docs/modules/operations/README.md`
- `docs/runbooks/copilot.md`
- `docs/plans/unified-2026-10-31-freeze-and-gaps.md`

Frozen ERP modules were **not** edited by this task. (Working tree may contain unrelated pre-existing dirty files outside this list — leave them alone.)

### Manual check (operator)

1. Operations → Automation → New rule, trigger **Booking created**, action **Notify**.
2. Create a booking → Activity Log shows `operations.automation.notify`.
3. Same for **CRM follow-up created**.
4. Baiko: ask “upcoming bookings” → tool lists scheduled/confirmed; deep links to calendar.
5. Migration Center: confirm Lane A reconcile checklist is visible.
