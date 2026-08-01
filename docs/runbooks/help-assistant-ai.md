# Help Assistant AI + Baiko

The in-app Help Assistant retrieves Knowledge Base / guide chunks (keyword RAG). Optional DashScope wording runs on the Go API. Baiko adds live read-only tools and approve-to-act drafts.

## Migrations

1. `159_help_assistant.sql` — `help_feedback_events`
2. `206_financial_health.sql` — dashboard financial health + recurring expenses
3. `207_copilot_foundation.sql` — `copilot_sessions`, `copilot_messages`, `copilot_usage_daily`, `help_ranking_overrides`, `copilot_action_audits`

## A. Alibaba Cloud Model Studio (once)

1. Sign in to Alibaba Cloud → **Model Studio** (Singapore workspace if that is your region).
2. Create an **API key**; copy it once.
3. Confirm the **OpenAI-compatible** base URL (must end with `/compatible-mode/v1`, not `/api/v1`). Wrong URL → 404.
4. Enable chat models: Flash/Turbo-class (cheap rewrite) + Plus (tool synthesis). VL only if you use Smart RFQ.
5. Set billing alerts on the Alibaba account.

## B. API server env (never `VITE_*`)

```env
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://{your-workspace}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
HELP_AI_ENABLED=true
HELP_AI_MODEL=qwen-flash
COPILOT_ENABLED=true
COPILOT_SMALL_MODEL=qwen-flash
COPILOT_MEDIUM_MODEL=qwen-plus
COPILOT_DAILY_TOKEN_CAP=500000
```

Restart the API after changes.

## Feedback

```http
POST /api/v1/help/feedback
{ "query": "...", "pathname": "/app/...", "article_id": "...", "vote": "up"|"down" }
```

Down/up votes update `help_ranking_overrides` (demote/boost) used by server retrieve.

Admin UI: `/app/user-management/help-feedback`

## Server retrieve (same corpus as Help index)

Export chunks from web (embeds into Go):

```bash
cd web && npm run export:help-corpus
```

```http
POST /api/v1/help/retrieve
{ "query": "cannot confirm quotation", "pathname": "/app/quotation/quotations", "limit": 3 }
```

## Optional AI compose (small model)

```http
GET /api/v1/help/ai-config
POST /api/v1/help/compose
{
  "query": "...",
  "pathname": "/app/...",
  "hits": [{ "article_id": "...", "title": "...", "snippet": "...", "steps": [] }],
  "personalization": { "role_code": "owner", "branch_id": 1, "locale": "en" },
  "stream": false
}
```

Set `"stream": true` for SSE (`event: delta` / `event: done`). Empty hits are rejected (no invent). Daily token cap → `ERR_COPILOT_CAP`.

## Baiko ask (docs | ops | action)

```http
GET /api/v1/copilot/config
POST /api/v1/copilot/ask
{ "query": "what is overdue?", "pathname": "/app/dashboard" }
```

- **docs** — server keyword retrieve + small-model compose  
- **ops** — allowlisted tools (`get_financial_health`, `list_overdue_ar`, `find_stock`, `crm_follow_ups`) + medium-model summary  
- **action** — returns `action_draft` only; nothing posts until Approve

```http
POST /api/v1/copilot/actions/approve
{ "draft": { "type": "create_recurring_expense", "payload": {...} } }
POST /api/v1/copilot/actions/deny
{ "draft": { "type": "..." } }
```

RFQ import draft points users to existing Quotations → Import RFQ (same VL stack).

## Verify

1. Sign in as a store user → Help → ask a known guide question → article cards; AI answer if enabled.
2. `GET /api/v1/help/ai-config` → `enabled: true`, `small_model` set.
3. Ops: ask “what is overdue?” with `dashboard.kpis` → numbers align with Financial health panel.
4. Stock: ask “find stock WIDGET” with inventory read → Find Stock deep link.
5. Golden CI: `go test ./internal/modules/helpassistant/ -run Golden` (≥90% retrieve).

## Safety

- Retrieval grounded in exported KB/guides only (v1).  
- Writes never auto-post; Approve required.  
- Tools check permissions (`dashboard.kpis`, `inventory.stock_movements`, CRM, finance write).  
- Usage logged to `copilot_usage_daily`.

## Related

- Baiko operator day-to-day: `docs/runbooks/copilot.md`
- RFQ vision: `docs/runbooks/dashscope-rfq-ai.md`
- Golden queries: `web/src/modules/help-assistant/helpGoldenQueries.ts`
