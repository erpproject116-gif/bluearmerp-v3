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
2. The API classifies the document as government section-spec, government Annex table, spreadsheet BOQ, general RFQ, invoice-like, **spec sheet** (`spec_sheet` — technical specification with no order quantities, e.g. a UPS datasheet), or unknown.
3. Deterministic parse runs first (OCR + grid heuristics). Government headings such as `I. LAPTOP (8 units)` become one item; following bullets remain technical specifications.
4. If quality is weak, **Enhance with AI** sends page text + JPEG renders to `POST /api/v1/quotation/rfq-import/ai-parse`.
5. API batches pages (`RFQ_AI_PAGES_PER_CALL`, default 2) up to `RFQ_AI_MAX_PAGES`; the UI reports pages omitted by that cap.
6. Both deterministic and AI lines pass through the same sanitizer before inventory matching.

`POST /api/v1/quotation/rfq-import/run` is the agent-ready orchestration contract: classify → deterministic parse → conditional AI → sanitize → match. It uses the same Qwen VL implementation as the modal; there is no second RFQ model.

Invoice-like documents and spec sheets are blocked before AI, matching, or quotation Apply (`rfqBlockedReason` in `rfqimport.go`). Spec sheets return zero lines with a warning instead of junk rows.

If deterministic parsing yields **zero lines** on a non-blocked document (e.g. an OCR-garbled Annex), the error area in the import modal shows a **Try AI extraction** button so VL can still attempt the page images.

## Capturing real payloads (fixture workflow)

Text-only hand-authored fixtures cannot reproduce word-coordinate layouts. To add a new sample to the corpus:

1. In **Import RFQ** (requires `quotation.quotations` write), pick the file, then use **Export parse payload** in the review step (or next to the error when parsing fails). This downloads the exact `{pages:[{page,text,words,width,height}],tables}` JSON the client posts to `/rfq-import/*`.
2. Alternatively run `node web/scripts/capture-rfq-payload.mjs <file>` to produce the same JSON headlessly (PDF text layer + SheetJS tables; no OCR).
3. Save it under `api/internal/modules/quotation/testdata/rfq_corpus/payloads/` and add the expected document type, line counts, and qty/unit/name asserts to `payloads/expected.json` (`held_out: true` for samples engineers must not tune patterns against).
4. `go test ./internal/modules/quotation/ -run RfqPayload -count=1` runs exact asserts (`TestRfqPayloadCorpus`) plus the aggregate scorecard (`TestRfqPayloadScorecard`: type accuracy, line-count match rate, field match rate).

## Golden corpus and regression

Fixtures derived from DOJ NPS/PADS, CSC Annex A, the laptop/desktop workbook, and a scrubbed invoice negative control are under:

`api/internal/modules/quotation/testdata/rfq_corpus/`

Run:

```bash
cd api
go test ./internal/modules/quotation/ -run Rfq -count=1
```

Expected corpus behavior:

- DOJ NPS: Laptop 8 units; Printer 5 units.
- DOJ PADS: Laptop 8 units; Printer 3 units.
- CSC Annex A: Lanyard 500 sets.
- Workbook: Laptop 85; Desktop 64.
- Scrubbed invoice: blocked, zero RFQ lines.
- Numbered section variants (`1. Laptop – 8 units`, `Item 1: Desktop (qty 64)`): classified as `gov_section_spec` with rolled-up parents.
- BOQ text that mentions “Amount Due” but also “request for quotation” / BOQ headers: **not** `invoice_like`.

These are prompt/parser regression fixtures, not DashScope model-weight fine-tuning.

## Quantity/unit parsing and unit seeds (2026-07)

- Fused cells like `600 PCS` and description prefixes like `10 BOTTLES INK …` are split by `splitQtyUnitCell` / `extractQtyUnitPrefix` (`rfqtable.go`); units normalize through `normalizeRfqUnit` aliases (`boxes`→`box`, `unrt`→`unit`, etc.).
- Migration `210_rfq_units_seed.sql` seeds common units (`roll`, `bottle`, `pack`, `ream`, `unit`, `lot`, …) into `inv_units` for active tenants; `resolveRfqLineUnit` also maps RFQ `pcs` → inventory `pc`.
- Document-reference noise rows (e.g. a bare `PR38936`) are filtered by `rfqDocRefRow`.

## Hardening notes (2026-07)

- Strong deterministic government sections (confidence ≥ 0.9) skip VL unless `force_ai` / Enhance with AI.
- All `/rfq-import/*` routes require `quotation.quotations` read.
- Auto-bind threshold remains **0.7**; see `rfqmatch_threshold_test.go` (do not change without a measured match eval).
- Large scanned PDFs over the client OCR page cap: use a page range ≤ `RFQ_CLIENT_OCR_PAGE_MAX` for browser OCR — server extract is text-layer only.
- Tesseract core/lang assets must be self-hosted under `web/public/tess/` (see README there).

## Live verification checklist

Record results after a real DashScope-enabled import. Nine captured samples (ground truth in `testdata/rfq_corpus/payloads/expected.json`) plus the Copilot attachment handoffs:

| Sample | Expected | Observed (fill in) |
|--------|----------|--------------------|
| BATELEC 38936 PDF | `rfq`, 10 lines with qty+unit (600 pcs ballpen …) | |
| BATELEC 38937 PDF (held-out) | `rfq`, 10 lines (30 box fastener …) | |
| BATELEC 38938 PDF (held-out) | `rfq`, 10 lines (120 pcs Pentel pen …) | |
| DOJ NPS PDF | `gov_section_spec`, Laptop 8 / Printer 5 | |
| DOJ PADS PDF | `gov_section_spec`, Laptop 8 / Printer 3 | |
| DSWD7-2026-0754 PDF | `gov_annex_table`, 0 deterministic lines; **Try AI extraction** offered → Scanner qty 2 | |
| UPS spec PDF | `spec_sheet`, blocked with warning, 0 lines | |
| Desktop PC Mid-Range Specs (scan) | OCR path (requires `web/public/tess/` assets); no junk lines | |
| RFQ.xls | `spreadsheet_boq` via SheetJS tables; footer rows filtered | |
| Items CSV in Copilot chat | `map_import_dataset` draft → Approve opens Migration Center mapped-import modal prefilled; nothing imports until confirmed there | |
| Serial CSV in Copilot chat | `propose_serial_lot_import` draft → Approve stages serials in Serial & Lot → Receive paste buffer; no DB write | |

## Agentic boundary

Copilot may call `run_smart_rfq`, summarize matched lines, and prepare a `create_quotation_from_rfq` approval draft. Approve only stages sanitized lines in browser session storage and opens `/app/quotation/quotations/new`. The user must review and save the quotation form. Copilot does not insert, confirm, post, or email the quotation.

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
