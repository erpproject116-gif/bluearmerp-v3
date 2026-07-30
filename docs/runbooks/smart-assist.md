# Smart Assist — operator notes

Deterministic recovery payloads on transaction failures. **No LLM** authors `assist` fields.

## Envelope

Failed saves may include:

```json
{
  "success": false,
  "message": "Validation failed.",
  "code": "ERR_VALIDATION",
  "errors": { "qty": "Quantity exceeds PO balance (1.0000)." },
  "assist": {
    "code": "SA_SI_QTY_EXCEEDS_PO_BALANCE",
    "title": "Quantity exceeds open PO balance",
    "detail": "Quantity exceeds PO balance (1.0000).",
    "field": "qty",
    "actions": [{ "label": "Open Goods Receipts", "href": "/app/purchase-order/goods-receipt" }]
  }
}
```

Helpers: `response.ValidationAssist`, `response.ErrAssist`, `response.ValidationSmart` (attaches assist when the error text matches a known rule).

## Client

[`handleSaveResult`](../../web/src/shared/handleSaveResult.ts) prefers `assist` → `toast.action` (title, detail, CTA). Unwired errors keep the previous field-error / policy-hint path.

## First-wave codes

| Code | Typical trigger |
|------|-----------------|
| `SA_PO_QTY_EXCEEDS_OPEN` | GR qty above open PO |
| `SA_SI_QTY_EXCEEDS_PO_BALANCE` | SI qty above PO/GR balance |
| `SA_SI_SERIAL_LOT_NEEDS_GR` | Serial/lot billed without GR |
| `SA_SI_QTY_EXCEEDS_UNRECEIVED_PO` | Auto-receive blocked |
| `SA_FISCAL_YEAR_CLOSED` / `SA_FISCAL_PERIOD_CLOSED` | Posting into closed FY/period |
| `SA_PAYMENT_EXCEEDS_OUTSTANDING` | OR/PV over-apply |
| `SA_RETAINER_NOT_FUNDED` / `SA_RETAINER_EXCEEDS_REMAINING` | Retainer apply gates |
| `SA_WHT_CODE_NOT_FOUND` | Missing active WHT code |

Second wave (same matcher): `SA_DR_EXCEEDS_RELEASED`, `SA_SI_EXCEEDS_DELIVERED`, `SA_JE_MUST_BALANCE`, `SA_BACKDATED_POST_BLOCKED`.

## Non-goals

- No Copilot page required to unblock a save
- No LLM generation of titles, amounts, or hrefs
- No auto-post from assist CTAs
