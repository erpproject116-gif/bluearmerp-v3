# Help Assistant — feedback API + optional grounded AI

The in-app Help Assistant retrieves Knowledge Base / guide chunks in the browser (keyword RAG). This runbook covers the **server** pieces: feedback persistence and optional DashScope wording.

## Migration

Apply `159_help_assistant.sql` (creates `help_feedback_events`).

## Feedback

Authenticated users posting Yes/No on a result card:

```http
POST /api/v1/help/feedback
{ "query": "...", "pathname": "/app/...", "article_id": "cannot-confirm-document", "vote": "up" }
```

Events are also kept in browser `localStorage` (`bluearm-help-feedback-v1`) as a local buffer.

## Optional AI (grounded compose)

1. Reuse the same DashScope key as RFQ AI (`DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`).
2. Set on the **Go API** host:

```env
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://{workspace}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
HELP_AI_ENABLED=true
HELP_AI_MODEL=qwen-plus
```

3. Restart the API and check:

```http
GET /api/v1/help/ai-config
```

Expect `"enabled": true`, `"provider": "dashscope"`.

4. Compose (browser sends retrieved hits; model must not invent outside them):

```http
POST /api/v1/help/compose
{
  "query": "cannot confirm quotation",
  "pathname": "/app/quotation/quotations",
  "hits": [{ "article_id": "...", "title": "...", "scenario": "...", "snippet": "...", "steps": [] }]
}
```

If AI is off or fails, the UI keeps the deterministic local reply (articles + steps). If the model returns `INSUFFICIENT_CONTEXT`, the UI also keeps the local message.

## Safety model

- Retrieval stays client-side and works offline / without AI.
- The LLM only sees the top retrieved articles the user already matched.
- Empty hit lists are rejected by the API (no open-ended generation).

## Related

- RFQ vision AI: `docs/runbooks/dashscope-rfq-ai.md`
- KB scenarios: `web/src/modules/documentation/helpScenarioArticles.ts`
- Golden queries: `web/src/modules/help-assistant/helpGoldenQueries.ts`
