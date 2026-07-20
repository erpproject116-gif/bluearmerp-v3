# Agency / BPO operations (tenant-per-client)

BluearmERP is **not** a multi-client-in-one-tenant BPO product today. The fast path for staffing agencies and outsourced HR is **one tenant per end client**, with your agency staff using the **tenant switcher** to move between clients.

## Recommended model

| Layer | Approach |
|-------|----------|
| Client data isolation | Separate tenant per client (strong boundary, existing RBAC) |
| Agency operators | Users granted access to multiple tenants via platform / console |
| Employee handoffs | ESS signature on reviews, discipline ack, onboarding tasks → 201 file |
| Payroll / statutory | Per-tenant payroll runs (no cross-tenant consolidation in-app) |

## Onboarding a new client tenant

1. Create tenant (platform console or signup flow).
2. Enable modules: HR, Payroll, Booking (if rooms/shifts), POS (if F&B on-site).
3. Import employees via HR import profiles / migration center.
4. Link ESS users to employee records.
5. Configure leave types, pay periods, and statutory packs with the client’s accountant.

## Signed handoffs (ESS)

- **Performance reviews:** employee draws signature + typed name → signed HTML stored in 201.
- **Discipline:** acknowledge case from ESS (timestamp; signature reuse planned same pad component).
- **Onboarding tasks:** mark complete from ESS; audit trail on HR side.

## What we are not building in this track

- Parent org + `client_id` column across all HR tables.
- Consolidated multi-client payroll in one tenant.
- Client-branded ESS portals without separate tenant branding settings.

## Hospitality compose (hotels / restaurants)

- **Rooms / stays:** Booking module (`resource_type = room`).
- **F&B:** POS with **Restaurant** hospitality profile (table/covers labels).
- **Property listings for sale/rent:** parked — use CRM + Quotation, not POS.

See also `docs/CONVERSATION_GAP_CLOSE_ROADMAP.md`.
