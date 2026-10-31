# Template R3 — CRM alert created → external notify

1. Bluearm outbound webhook; filter `crm.alert.created` (or `crm.*`).
2. Verify `X-Bluearm-Signature`.
3. Slack/email HTTP with alert title/body from `payload`.
4. Confirm delivery row in User Management → Outbound webhooks.
