# Bluearm Copilot — operator runbook

Cost-efficient Ask over existing Help guides, then live read-only tools, then approve-to-act. Orchestration stays in the Go API next to auth/datascope.

## Locked product defaults

1. Corpus v1 = same KB/guides Help already indexes (export → Go embed).
2. Retrieval v1 = keyword scoring (not embeddings).
3. Small model (`COPILOT_SMALL_MODEL`) for doc rewrite; medium (`COPILOT_MEDIUM_MODEL`) for tool synthesis; VL stays RFQ-only.
4. Writes never auto-post.
5. No second Python service.

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
