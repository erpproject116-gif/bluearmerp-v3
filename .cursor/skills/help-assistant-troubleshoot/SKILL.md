---
name: help-assistant-troubleshoot
description: >-
  Detects, locates, and resolves Bluearm ERP user errors using the in-app Help
  Assistant corpus, API validation messages, Load Slip/process-policy gates, and
  UI form blockers. Use when troubleshooting support tickets, empty Load Slip,
  confirm blocks, unregistered products, validation errors, Help Assistant
  content, or when the user asks to automate ERP troubleshooting.
---

# Help Assistant — error detect & solve

## Goal

Turn a user symptom (toast, validation map, empty Load Slip, blocked Confirm) into:

1. **Located cause** (file/endpoint/policy/UI gate)
2. **Accurate fix** (steps the user can take, or a code fix if Agent mode)
3. **Help corpus update** when the error is recurring and not yet indexed

## Workflow

### 1. Capture the signal

Collect what you can: exact error string, route (`/app/...`), document type, screenshot text, API `fields` map, process-policy flags.

Treat UI toasts and `response.Validation` field messages as primary keys for retrieval.

### 2. Retrieve before inventing

Prefer repo Help Assistant sources:

| Source | Path |
|--------|------|
| Scenario articles | `web/src/modules/documentation/helpScenarioArticles.ts` |
| Module KB | `web/src/modules/documentation/moduleKbArticles.ts` |
| Error aliases | `web/src/modules/help-assistant/helpArticleAliases.ts` |
| Search / compose | `helpSearch.ts`, `composeHelpReply.ts` |
| Golden queries | `helpSearch.test.ts` |

Match `errorPhrases` / `questions` case-insensitively. If a hit exists, answer with those steps first.

### 3. Locate in product code when Help misses

Map symptom → layer:

| Symptom | Likely layer |
|---------|----------------|
| Empty Load Slip | `*picker*.go`, `*_integration.go`, OpenTransactionMonitor date/partner filters |
| Confirm blocked | processpolicy, attachment rules, foundation setup, required fields |
| “Register the product in Inventory…” | Line compute gates on SO / Sales / PO / Purchases |
| Free-text quote/RFQ | Quotation/RFQ/PR line grids allow null `item_id` |
| Serial not found | `DocumentSerialScanBar`, serial resolve context sale vs purchase |

Cite concrete paths when stating root cause.

### 4. Solve accurately

- **User-facing:** shortest ordered steps + success signal (e.g. “Load Slip shows N lines”).
- **Code:** fix the gate or empty filter; update Help article + aliases + a golden query in the same change when the bug was confusing.
- Do not invent policy behavior — read `processpolicy` / ADR `0005` when unsure.

### 5. Inventory product rules (important)

- **Allowed without inventory `item_id`:** Quotation, RFQ, Purchase Request (free-text code/name).
- **Require registered item:** Sales Order, Sales (invoice), Purchase Order, Purchases (supplier invoice).
- Load Slip into SO/PO only lists lines that already have `item_id`.

### 6. Load Slip empty checklist (default)

1. Source doc Confirmed / Complete (not Unconfirmed draft).
2. Clear date filters (defaults should be all-open, not last-30-days).
3. Clear partner lock if wrong customer/vendor.
4. Remaining qty > 0 (not fully slipped).
5. Legacy Sales Invoice: confirmed SO ordered residual; serial items still need Pick List.
6. Wrong Load Slip menu source (Quotation vs SO vs PR vs RFQ vs GR).

## Output format

```markdown
**Cause:** <one sentence, evidence-backed>
**Where:** `<path>` / Help article `<id>`
**Fix for user:**
1. …
2. …
**If code change needed:** <brief>
```

## When adding Help content

New recurring blocker → add `helpScenarioArticles` entry with `questions` + `errorPhrases`, register id in `knowledgebaseGroups.ts`, mirror aliases, add one golden in `helpSearch.test.ts`.
