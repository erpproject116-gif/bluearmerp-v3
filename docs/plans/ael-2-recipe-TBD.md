# Automation recipe — TBD (B-POINT not closed)

**Status:** Owner has not named a paid workflow. Do **not** claim B-POINT closed.

**Working title:** TBD — e.g. candidates: “Booking created → Slack”, “CRM follow-up stage → Make task”.

## Intended steps (template for when named)

1. Bluearm → User Management → **Outbound webhooks** → Create endpoint.
2. Rotate secret; store it in Make/Zapier.
3. Event filter e.g. `booking.*` or `crm.*` (see `ael-2-event-inventory.md`).
4. Set Active with a public HTTPS Make/Zapier/n8n Cloud webhook URL.
5. In Make: Custom webhook → verify `X-Bluearm-Signature` (HMAC-SHA256 hex of raw body) → one action (Slack, etc.).
6. Trigger the Bluearm event (create booking / follow-up) → confirm delivery row and Make receive.

## External receive proof

**Not recorded this session** (no live Make run). Operator must complete after naming the recipe.

## Related

- Hub UI: `/app/user-management/outbound-webhook`
- Inventory: `docs/plans/ael-2-event-inventory.md`
- Brief: `docs/plans/ael-2-automation-extension-brief.md`
