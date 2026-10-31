# Template R1 — Booking created → Slack

1. Trigger: Webhook (catch Bluearm outbound URL) **or** HTTP piece receiving POSTs from Bluearm endpoint.
2. Verify header `X-Bluearm-Signature` (HMAC-SHA256 hex of raw body with endpoint secret) — reject if mismatch.
3. Filter: `event` equals `booking.created` (or starts with `booking.`).
4. Action: Slack “Send message” (or HTTP POST to Slack incoming webhook) with text including `tenant_id`, booking id from `payload`.
5. Test twice: second delivery should not double-post if you add an idempotency store keyed by delivery id / event+payload hash.
