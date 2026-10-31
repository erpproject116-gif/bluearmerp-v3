# Unified finish — integrations (2026-10-31)

Owner instruction: proceed until remaining tracks finished. Product blockers treated as cleared for **in-repo** surfaces only.

## Track 6 — Outbound webhooks (Done)

- Migration `334_outbound_webhook_and_attachment_vault.sql`
- API: `GET/PUT /api/v1/platform/integrations/outbound-webhook`, `POST …/rotate-secret`
- Permission: `platform.outbound_webhook`
- Emit path: `operations.EmitERPEvent` → `outbound.Emit` (CRM/booking/ops events already routed through EmitERPEvent; CRM alerts also emit `crm.alert.created`)
- Signature: header `X-Bluearm-Signature: sha256=<hex>` over raw JSON body
- Prefer **Activepieces** (MIT CE) or **n8n** as external consumer — not embedded

### Smoke

1. Apply migration 334.
2. `POST …/rotate-secret` → save secret.
3. `PUT` with `target_url`, `is_active: true`, filter e.g. `["booking.*","crm.*"]`.
4. Create booking → receiver gets signed JSON.

## B-MAIL — CRM alert email (Done)

- On new `crm_notifications` insert (deduped), email business owners via existing `outbox.DeliverHTMLToMany` when mail is configured.
- No change to document/SI email paths.

## B-MIG Lane C — Attachment vault (Done, local disk)

- Table `mig_attachment_vault`; files under `data/migration-vault-attachments/tenant-{id}/`
- `POST /api/v1/migration/attachments/import` multipart `files` + optional `manifest` CSV (`file_name,legacy_doc_type,legacy_doc_no,checksum_sha256`)
- `GET /api/v1/migration/attachments?orphans=1`
- Linking to live ERP docs = follow-up (orphans flagged)

## B-OWUI — Go OpenAI adapter (Done); Python service not in Bluearm

- `GET /api/v1/copilot/openai/v1/models`
- `POST /api/v1/copilot/openai/v1/chat/completions` (`stream:false` only) → `RunAsk`
- Point Open WebUI OpenAI base URL at that path with Bluearm JWT; keep Open WebUI branding; **do not** replace `/app/baiko` or Operations Automation
- Waive of “no second Python service” applies only to **optional external** OWUI container — not a second Python service inside the Go API

## B-POINT — Point tools (Docs only / still need named workflows)

Do **not** embed Chatwoot, cal.diy, Listmonk, Documenso, Formbricks, or Typebot until a named paid workflow exists. Wire them via outbound webhooks + their APIs:

| Tool | Typical trigger filter | Note |
|------|------------------------|------|
| Chatwoot | `crm.*` | Omnichannel inbox |
| cal.diy | `booking.*` | Public scheduling → create Bluearm booking via API |
| Listmonk | custom campaign events | Prefer SES; not Postal |
| Documenso | quotation/proposal signed webhook → Bluearm | Inbound later |
| Formbricks / Typebot | form submit → `POST` lead/CRM | Capture only |

## Still not “product Done”

- Full OWUI Docker compose in-repo (operator deploys separately)
- Point-tool Docker embeds
- Attachment auto-link to quotation/sales rows
- Webhook delivery UI / retry queue (log-only v1)
