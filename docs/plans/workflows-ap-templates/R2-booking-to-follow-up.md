# Template R2 — Booking created → CRM follow-up

1. Same Bluearm webhook trigger + signature verify as R1.
2. Filter: `event` = `booking.created`.
3. HTTP POST to Bluearm:
   - URL: `{API}/api/v1/platform/workflows/actions/crm.create_follow_up`
   - Headers: `Authorization: Bearer {integration user JWT}`, `Idempotency-Key: booking-{payload.booking_id}-followup`, `Content-Type: application/json`, `X-Tenant-ID` if required by deployment
   - Body: `{ "title": "Follow up booking", "due_date": "YYYY-MM-DD", "notes": "Auto from booking.created", "partner_id": null }`
4. Run twice with same Idempotency-Key → second response returns prior task id (no duplicate row).
