# Bluearm Copilot — operator runbook

Cost-efficient Ask over existing Help guides, then live read-only tools, then approve-to-act. Orchestration stays in the Go API next to auth/datascope.

## Locked product defaults

1. Corpus v1 = same KB/guides Help already indexes (export → Go embed).
2. Retrieval v1 = keyword scoring (not embeddings).
3. Small model (`COPILOT_SMALL_MODEL`) for doc rewrite; medium (`COPILOT_MEDIUM_MODEL`) for tool synthesis; VL stays RFQ-only.
4. Writes never auto-post.
5. No second Python service.

## Chat window hard limits

- **No source-code / repo revision** from chat (no write/edit/bash against application source).
- **No autopost** of journals, stock posts, payments, or document email send. Approve opens UI or only low-risk creates already allowed (CRM follow-up, recurring expense).
- **No free-form SQL / shell / arbitrary HTTP** tools for the model.
- **No secrets** in chat (passwords, API keys, card data).
- **Tenant + permission only** (no cross-tenant elevation).
- **No SSRF** (no server fetch of arbitrary external URLs).
- Approve `next` navigation is resolved **only** from the server action catalog — client `payload.ui` is ignored.
- Deep links must be `/app/...` (server `SafeAppPath` + client allowlist). External `https://` markdown links show an “opens outside Bluearm” note.
- Ask query ≤ 4000 chars; attachments capped (count + packed text). Per-user rate limits on ask/approve; `COPILOT_DAILY_TOKEN_CAP` remains the hard token ceiling.
- Tool JSON is **packed** before the medium model (null/empty stripped, truncated with `…[truncated]`). Debug/audit may show `pack_bytes` vs `unpacked_bytes`. Idempotent reads (`get_financial_health`, `lookup_entities`, etc.) use a short in-process session cache.

## Day-to-day after Phase 1

1. Content owners edit KB/scenario articles in web source; redeploy web **and** re-export corpus:

   `cd web && npm run export:help-corpus`

   Then rebuild/redeploy the API so `help_chunks.json` is embedded.

2. Review Help feedback admin (`/app/user-management/help-feedback`) weekly; fix wrong articles, not the model.

3. Watch Alibaba billing + `COPILOT_DAILY_TOKEN_CAP`; raise cap only with a billing alert.

4. Keep golden retrieve green: `go test ./internal/modules/helpassistant/ -run Golden`

5. Apply migration `208_copilot_chat_ux.sql` for session titles + attachment metadata.

6. Chat UX: maximize the Copilot panel (▣), use **History** for prior sessions, attach PDF/DOCX/XLSX/CSV/images via **+**.

7. Entity tags: type **@** in the composer to search and tag items, customers, vendors, serials, invoices, quotations, POs, SOs, and load-slip refs (`@[type:id|label]`). Ask e.g. “generate quotation for @…”, “create follow-up for @…”, “send email quotation @…”, then **Approve** (writes never auto-post; quote/email open the UI).

8. **Auto-escalate:** if intent is “docs” but guides/KB return no hit, `INSUFFICIENT_CONTEXT`, or only an ungrounded title list, Copilot automatically runs live tools (financial health, etc.) and prefixes the reply that guides weren’t enough.

9. **Action catalog (approve-to-act):** quotation, sales order, sales invoice, purchase request, RFQ, purchase order, purchases, email send, bulk inventory (import/stock UI), product bundle / PC build, manufacturing BOM, CRM follow-up (full create). Document actions open the ERP form with tagged @entities — they do **not** auto-post. Ops tools: recommend items, compare pricing, smart notifications.

## Permissions (Phase 2)

| Tool | Permission |
|------|------------|
| Financial health / overdue | `dashboard.kpis` read |
| Find stock | `inventory.stock_movements` read |
| CRM follow-ups | `crm.follow_up_tasks` read (or KPIs) |
| Create follow-up (approve) | `crm.follow_up_tasks` write |
| Create recurring expense (approve) | `finance.contract_write` write |
| Entity search | authenticated tenant user |

Branch-scoped users still only see datascope-filtered data when the underlying APIs enforce it.

## Env checklist

See `docs/runbooks/help-assistant-ai.md` section B. Minimum:

- `DASHSCOPE_API_KEY` + compatible-mode `DASHSCOPE_BASE_URL`
- `HELP_AI_ENABLED` / `COPILOT_ENABLED`
- `COPILOT_SMALL_MODEL=qwen-flash`, `COPILOT_MEDIUM_MODEL=qwen-plus`
- Migration `207_copilot_foundation.sql` applied

## Out of scope (intentional)

Fine-tuned private model; DashVector until keyword+tools prove insufficient; autopost JE/stock; Zapier-style external agents.
