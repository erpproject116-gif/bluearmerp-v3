# Pass 4 addendum — G-12, G-30, G-32

**Date:** 2026-08-26

## G-12 Shipping / trip statuses

| Entity | Allowed values |
|--------|----------------|
| `sh_shipping_orders.status` | `draft`, `confirmed`, `shipped`, `cancelled` |
| `dl_delivery_trips.status` | `planned`, `in_progress`, `completed`, `cancelled` |

- Migration: `api/migrations/266_shipping_trip_status_enums.sql` (normalizes legacy free-text then adds CHECK)
- API: `shipping/status.go` + create/patch validation
- Tests: `shipping/status_test.go`
- Docs: sales-order README + sell-chain playbook

## G-30 Module READMEs

Added thin READMEs (pointing at Notion playbooks):

`pos`, `hr`, `quality`, `support`, `booking`, `sop`, `okr`, `after-sales`, `activity-logs`, `data-center`, `manufacturing`, `wms`

## G-32 SOP / OKR help

- New sections in `documentationSections.ts` (`sop`, `okr`)
- Linked in `documentationGroups.ts` under CRM & service
- Module READMEs as above

## Apply migration

```bash
# local / CI — include 266 in your usual migrate / db reset path
psql "$DATABASE_URL" -f api/migrations/266_shipping_trip_status_enums.sql
```
