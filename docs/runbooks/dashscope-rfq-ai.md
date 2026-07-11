# DashScope (Qwen) — Smart RFQ import

Server-side AI enhancement for RFQ/BOQ PDF and document import uses **Alibaba Cloud DashScope** (Qwen VL models). The API key never goes to the browser.

## Enable

1. Open [Alibaba Cloud Model Studio](https://modelstudio.console.alibabacloud.com/) and create an API key.
2. Set on the **Go API host** (`.env`, `web/.env.local`, or ECS secrets):

```env
DASHSCOPE_API_KEY=sk-...
QWEN_VL_MODEL=qwen-vl-plus
RFQ_AI_ENABLED=true
RFQ_AI_MAX_PAGES=10
RFQ_AI_PAGES_PER_CALL=2
```

3. Restart the API and confirm:

```http
GET /api/v1/quotation/rfq-import/ai-config
```

Response should include `"enabled": true`, `"provider": "dashscope"`, and your model id.

## Endpoint region

Alibaba Model Studio gives a **workspace URL** for Singapore. Use the **OpenAI compatible** path:

```env
# Correct (Singapore workspace from Model Studio console):
DASHSCOPE_BASE_URL=https://{your-workspace-id}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1

# Wrong — causes HTTP 404:
# DASHSCOPE_BASE_URL=https://{workspace}.ap-southeast-1.maas.aliyuncs.com/api/v1
```

The API auto-corrects `/api/v1` → `/compatible-mode/v1` if you paste the console URL by mistake.

| Deployment | `DASHSCOPE_BASE_URL` |
|------------|----------------------|
| Singapore workspace (recommended) | `https://{workspace-id}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` |
| US (Virginia) | `https://dashscope-us.aliyuncs.com/compatible-mode/v1` |
| China mainland | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Legacy intl (may 404 with new keys) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |

Omit `DASHSCOPE_BASE_URL` only if the legacy intl endpoint works for your API key.

## Model selection

| Model | When to use |
|-------|-------------|
| `qwen-vl-plus` | **Default** — gov RFQ/BOQ tables, OCR + vision |
| `qwen2.5-vl-72b-instruct` | Hard PDFs (merged cells, poor scans) — higher cost/latency |
| `qwen-vl-max` | Older tier; use if Plus unavailable in your region |

One VL model handles both text-only pages and image pages.

## How it works

1. User imports RFQ in Quotation → **Import RFQ**.
2. Deterministic parse runs first (OCR + grid heuristics).
3. If quality is weak, **Enhance with AI** sends page text + JPEG renders to `POST /api/v1/quotation/rfq-import/ai-parse`.
4. API batches pages (`RFQ_AI_PAGES_PER_CALL`, default 2) up to `RFQ_AI_MAX_PAGES`.

## Security

- `DASHSCOPE_API_KEY` is **server-only** — never add to Vite `VITE_*` vars.
- Rate limit: `/rfq-import/ai-parse` uses the expensive tier in the API rate limiter.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `ERR_RFQ_AI_DISABLED` | `DASHSCOPE_API_KEY` set on API host, `RFQ_AI_ENABLED=true` |
| HTTP 401 from DashScope | Key invalid or wrong region base URL |
| Empty lines returned | Try `qwen2.5-vl-72b-instruct`; verify page images render in browser network tab |
| Slow on large PDFs | Lower `RFQ_AI_MAX_PAGES` or `RFQ_AI_PAGES_PER_CALL=1` |

## Related

- Env reference: [environment-variables.md](./environment-variables.md)
- Alibaba ECS deploy (Sprint 2): [alibaba-deploy.md](./alibaba-deploy.md)
