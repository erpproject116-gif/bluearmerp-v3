# Live E2E release gates (quick reference)

Companion to [`deploy-checklist.md`](../runbooks/deploy-checklist.md) and [`live-e2e-baseline.md`](live-e2e-baseline.md).

## Before product fixes from E2E findings

1. Reproduce on live (read-only first).
2. Add failing automated regression when stable.
3. Baseline adjacent working paths.

## Per fix

- Affected unit tests + `npm test` (link integrity)
- `npm run build` (web) and/or `go test ./...` (api)
- Focused Playwright (`--project=chromium` or live read-only)
- Related business-chain surface test
- Synthetic demo smoke (CI) when API/web seeds change

## Separate release trains when possible

- Defect fixes vs UX/navigation redesigns vs destructive migrations (298)

## Schema / deploy order

1. API + migrations (`MIGRATE_ON_START`) until `/health/schema` healthy
2. Web promote
3. Golden path + live read-only E2E
4. Ticket drafts → review → submit

## Migration notes

| Migration | Gate |
|-----------|------|
| 297 | Catalog/constraint; confirm app billing support before relying on `standard_3mo` |
| 298 | **Separate review** + backup + row-count preview (DELETE) |
| 299 | Required before expense/retainer journal flows |
| 300 | Required before sales `delivery_remarks` |

## Rollback

- Web: previous Vercel deployment
- API: previous ECS git SHA
- Schema: forward-only — do not delete migration files
