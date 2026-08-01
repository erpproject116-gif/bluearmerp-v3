# Baiko — operator runbook

Cost-efficient Ask over existing Help guides, then live read-only tools, then approve-to-act. Orchestration stays in the Go API next to auth/datascope.

## Locked product defaults

1. Corpus v1 = same KB/guides Help already indexes (export → Go embed).
2. Retrieval v1 = keyword scoring (not embeddings).
3. Small model (`COPILOT_SMALL_MODEL`) for doc rewrite; medium (`COPILOT_MEDIUM_MODEL`) for tool synthesis; VL stays RFQ-only.
4. Writes never auto-post.
5. No second Python service.
6. **Full-page workspace** at `/app/baiko` (nav: Help & guides → Baiko). Legacy `/app/copilot` redirects here. Drawer (Ctrl+Shift+H) remains for contextual help. Shared session state.
7. **Smart Assist** on transaction failures is separate — see `docs/runbooks/smart-assist.md`. Zero LLM tokens on those toasts.

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

6. Chat UX: maximize the Baiko panel (▣), use **History** for prior sessions, attach PDF/DOCX/XLSX/CSV/images via **+**.

7. Entity tags: type **@** in the composer to search and tag items, customers, vendors, serials, invoices, quotations, POs, SOs, and load-slip refs (`@[type:id|label]`). Ask e.g. “generate quotation for @…”, “create follow-up for @…”, “send email quotation @…”, then **Approve** (writes never auto-post; quote/email open the UI).

8. **Auto-escalate:** if intent is “docs” but guides/KB return no hit, `INSUFFICIENT_CONTEXT`, or only an ungrounded title list, Baiko automatically runs live tools (financial health, etc.) and prefixes the reply that guides weren’t enough.

9. **Action catalog (approve-to-act):** quotation, sales order, sales invoice, purchase request, RFQ, purchase order, purchases, email send, bulk inventory (import/stock UI), product bundle / PC build, manufacturing BOM, CRM follow-up (full create). Document actions open the ERP form with tagged @entities — they do **not** auto-post. Ops tools: recommend items, compare pricing, smart notifications.

10. **Agentic Smart RFQ:** `run_smart_rfq` uses the quotation module's single `RunRfqImportPipeline` contract (classify → parse → conditional Qwen VL → sanitize → inventory match). It never uses a second Baiko extraction prompt/stack. If chat does not contain complete extracted page/table payload, Baiko opens the existing Import RFQ UI instead of pretending it parsed the binary.

11. **RFQ approve boundary:** `draft_quotation_from_rfq` / `create_quotation_from_rfq` allows at most 200 sanitized lines. Approve stages the seed in the browser and opens `/app/quotation/quotations/new`; it does not insert, save, confirm, post, or email a quotation. The user reviews and saves in the standard form. Invoice-like documents and spec sheets are blocked and cannot produce an Approve draft.

12. **Attach → map → import (`map_import_dataset`):** a sheet attachment (CSV/XLSX) plus an import-style ask produces a draft that auto-detects the Migration Center entity (items / partners / accounts) and auto-maps columns (same aliases as the modal). Approve stages `bluearm.migImportSeed` in `sessionStorage` and opens `/app/user-management/migration-center`, where the existing mapped-import modal opens prefilled — nothing imports until the user confirms there (`migration.center` write enforced by the import API). If the sheet reads like an RFQ (e.g. "REQUEST FOR QUOTATION", PhilGEPS), Baiko hands off to Import RFQ instead.

13. **Generalized document seeds:** `open_quotation|open_sales_order|open_sales|open_purchase_request|open_rfq|open_purchase_order|open_purchases` drafts that carry a partner and/or tagged `@item` lines return a sanitized seed on Approve (allowlisted fields, ≤ 200 lines, server-side `sanitizeDocSeedPayload`, write permission on the target module required when the payload seeds content). The client stores it under `bluearm.docSeed.<kind>` and the create form consumes it once; lines seeded from bare `@item` tags get qty 1 plus an amber "review quantities" warning. Copy always says "Review and save" — never "created".

14. **Serial & lot propose (`propose_serial_lot_import`):** a serial/lot CSV attachment (headers like `serial`/`lot`/`item_code`/`qty`, or one serial per line) produces a propose-only draft (≤ 500 rows). Approve stages `bluearm.serialLotSeed` and opens Serial & Lot → Receive with the list in the paste buffer. No serial, lot, or stock row is written until the user runs the existing capture actions.

### Seed sessionStorage keys (all one-shot, consumed on first read)

| Key | Consumer |
|-----|----------|
| `bluearm.rfqQuotationSeed` | Quotation create (legacy RFQ path; falls back to `bluearm.docSeed.quotation`) |
| `bluearm.docSeed.quotation` / `.sales_order` / `.sales` / `.purchase_request` / `.rfq` / `.purchase_order` / `.purchases` | Respective create modals / pages |
| `bluearm.migImportSeed` | Migration Center mapped-import modal |
| `bluearm.serialLotSeed` | Serial & Lot → Receive paste buffer |

Regression proofs: `go test ./internal/modules/copilot/` (sanitizer allowlists), `web/src/shared/docSeed.test.ts` (one-shot consume + validation), `web/e2e/copilot-seeds.spec.ts` (staged seed prefills the target screen; asserts staging only, never Save/Import).

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

Fine-tuned private model (including DashScope weight fine-tuning on RFQ samples); DashVector until keyword+tools prove insufficient; autopost JE/stock; silent create/post of commercial documents, serials, or lots (all seed flows stop at a prefilled form); rebuilding the Migration mapping UI inside the chat bubble; Zapier-style external agents.
