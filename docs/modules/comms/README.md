# Communications module

Transactional document email with PDF attachments, sent-message log, optional Gmail OAuth sync, email history panels on document modals, and **native Team Chat** (channels / GC / DM).

## Features

| Feature | Web route | API |
|---------|-----------|-----|
| Team Chat | `/app/comms/chat` | `/api/v1/comms/chat/*` |
| Sent Documents | `/app/comms/sent-documents` | `GET /api/v1/comms/sent-messages` |
| Inbox (Gmail sync) | `/app/comms/inbox` | `GET /api/v1/comms/inbox` |
| Settings / Gmail | `/app/comms/settings` | `GET/POST /api/v1/comms/gmail/*`, `GET/PUT /api/v1/comms/email-signature` |
| Email from document | modal **Email** button | `POST .../{doc}/send-email` per module |
| Doc email history | modal panel | `GET /api/v1/comms/doc-emails?doc_type=&doc_id=` |

## Team Chat

First-party staff messaging scoped to the JWT tenant (`tenant_id` on all tables + membership checks). Not Mattermost.

| Capability | Notes |
|------------|--------|
| Channels / groups / DMs | `comms.chat` permission |
| Unread badge | Sidebar Communications badge via `GET /comms/chat/unread-total` |
| Reply / forward | `parent_message_id`, `POST .../messages/{id}/forward` |
| Share to chat | Document toolbars (quotation, sales, SO, PO) next to Email |
| Typing / reactions / bubbles | Ephemeral typing TTL; emoji subset; `localStorage` bubble tails |
| Reminders | In-app `chat_reminders` (+ optional CRM follow-up); `/reminder` for everyone — **not** Google Calendar OAuth |
| Baiko `/` skills | **Owner or platform superadmin only**; approve-to-open drafts — never silent ERP writes |
| @mentions | Writes `crm_notifications` with `source=chat` |
| ERP document cards | Allowlisted entity types; server-built hrefs |
| File attachments | Combined **25 MiB** per message, Postgres `bytea` |
| Realtime v1 | Poll ~4s while the chat page is visible |

Schema: migrations `244_comms_chat.sql`, `245_chat_reply_forward_reactions_reminders.sql`.

## Schema

| Migration | Purpose |
|-----------|---------|
| `136_comms_foundation.sql` | `com_sent_messages`, `com_email_templates`, `com_thread_links`, module + permissions |
| `139_gmail_comms.sql` | `com_mail_messages`, Gmail connection tables, `comms.inbox` permission |
| `244_comms_chat.sql` | Team chat tables + `comms.chat` / `comms.chat_admin` + `crm_notifications` source `chat` |
| `245_chat_reply_forward_reactions_reminders.sql` | Reply, forward, reactions, typing, reminders, `sender_kind` |

## Delivery

1. User clicks **Email** on a saved document (`comms.send` permission).
2. Compose UI supports rich text, optional signature, and extra file attachments (≤25 MB combined with the document PDF).
3. API enqueues `com_sent_messages` row and generates PDF server-side (plus client attachments).
4. Outbox worker sends via Gmail API (if connected) or SMTP (`SMTP_HOST`, `SMTP_FROM`).
5. Sent log and modal **Email history** show status and thread stubs.

Signatures are per-user (`com_email_signatures`); edit under **Communications → Settings**.

## Demo data

`api/internal/modules/demodata/sql/seed-demo-comms.sql` creates sample sent messages with subjects `DEMO-COMMS-*`, stub inbox rows, and Team Chat channel `#general` with a sample quotation link when migration 244 is applied.

Status check: `demo_comms_sent` on Demo Data screen.

## Environment (production)

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST`, `SMTP_FROM` | Fallback email delivery (also `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT` | OAuth (Communications → Connect Gmail) |
| `CHANGE_ALERT_JOB_SECRET` (or `CRM_JOB_SECRET`) | Hourly owner digest: `POST /api/v1/platform/jobs/change-alert-digest`; daily ops: `POST /api/v1/platform/jobs/daily-ops-digest` |
| `CHANGE_ALERT_DIGEST_TO` | Optional override recipient(s), comma-separated. When unset, digests go to the **tenant owner** email. |

**Render free tier:** outbound SMTP ports are blocked. Prefer Gmail connect for document email, or a paid Render instance for SMTP (including owner digests) — see `docs/runbooks/render-deploy.md`.

**Owner digests:** queued from audit trails (quotation, SO, sales, PO, purchases, etc.); emailed hourly to the **tenant owner only**.

## In-app documentation

| Artifact | Location |
|----------|----------|
| Guide section | `documentationSections.ts` → `comms` |
| KB articles | `communications-overview`, `document-email-workflow` |
| Onboarding track | `communications` in `tracks.go` |

## Manual test checklist

1. Apply migrations `136`, `139`, `244`, `245`; enable `comms` module.
2. Communications → Team Chat → create channel / DM → post, reply, react, forward; @mention; attach ERP doc + file under 25 MB.
3. Sidebar Communications shows unread badge; top-nav Communications lands on Team Chat.
4. Owners/superadmins see `/` Baiko skills; members only see `/reminder` (API returns 403 for Baiko slash if forged).
5. Reminder fires in-app notification (and optional channel system message) — no Google Calendar OAuth.
6. Other tenant / non-member cannot open channel id or download attachment.
7. Save a quotation → Email / Share to chat → recipient or channel receives content.
8. Communications → Sent Documents lists email sends; Settings for Gmail/SMTP.
9. Demo Data populate — `#general` appears when chat tables exist; `DEMO-COMMS-*` subjects in email status checks.
