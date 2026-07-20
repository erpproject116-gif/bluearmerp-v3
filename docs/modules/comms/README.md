# Communications module

Transactional document email with PDF attachments, sent-message log, optional Gmail OAuth sync, and email history panels on document modals.

## Features

| Feature | Web route | API |
|---------|-----------|-----|
| Sent Documents | `/app/comms/sent-documents` | `GET /api/v1/comms/sent-messages` |
| Inbox (Gmail sync) | `/app/comms/inbox` | `GET /api/v1/comms/inbox` |
| Settings / Gmail | `/app/comms/settings` | `GET/POST /api/v1/comms/gmail/*` |
| Email from document | modal **Email** button | `POST .../{doc}/send-email` per module |
| Doc email history | modal panel | `GET /api/v1/comms/doc-emails?doc_type=&doc_id=` |

## Supported document types

**Selling:** quotation, sales order, sales invoice.

**Buying:** purchase order, RFQ (`rfq`), supplier quotation, supplier invoice (purchase).

Email history panels are on all of the above modals (buy-side added in phase 4).

## Schema

| Migration | Purpose |
|-----------|---------|
| `136_comms_foundation.sql` | `com_sent_messages`, `com_email_templates`, `com_thread_links`, module + permissions |
| `139_gmail_comms.sql` | `com_mail_messages`, Gmail connection tables, `comms.inbox` permission |

## Delivery

1. User clicks **Email** on a saved document (`comms.send` permission).
2. API enqueues `com_sent_messages` row and generates PDF server-side.
3. Outbox worker sends via Gmail API (if connected) or SMTP (`SMTP_HOST`, `SMTP_FROM`).
4. Sent log and modal **Email history** show status and thread stubs.

## Demo data

`api/internal/modules/demodata/sql/seed-demo-comms.sql` creates sample sent messages with subjects `DEMO-COMMS-*` and stub inbox rows linked to demo quotations/orders.

Status check: `demo_comms_sent` on Demo Data screen.

## Environment (production)

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST`, `SMTP_FROM` | Fallback email delivery (also `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT` | OAuth (Communications → Connect Gmail) |
| `CHANGE_ALERT_JOB_SECRET` (or `CRM_JOB_SECRET`) | Hourly owner digest cron: `POST /api/v1/platform/jobs/change-alert-digest` |

**Render free tier:** outbound SMTP ports are blocked. Prefer Gmail connect for document email, or a paid Render instance for SMTP (including owner digests) — see `docs/runbooks/render-deploy.md`.

**Owner digests:** queued from audit trails (quotation, SO, sales, PO, purchases, etc.); emailed hourly to the **tenant owner only**.

## In-app documentation

| Artifact | Location |
|----------|----------|
| Guide section | `documentationSections.ts` → `comms` |
| KB articles | `communications-overview`, `document-email-workflow` |
| Onboarding track | `communications` in `tracks.go` |

## Manual test checklist

1. Apply migrations `136`, `139`; enable `comms` module.
2. Save a quotation → Email → recipient receives PDF (or sent log shows `pending`/`sent`).
3. Communications → Sent Documents lists the message.
4. Reopen quotation modal — Email history panel shows the send.
5. Repeat on PO, RFQ, and supplier invoice modals.
6. Demo Data populate — `DEMO-COMMS-*` subjects appear in status checks.
