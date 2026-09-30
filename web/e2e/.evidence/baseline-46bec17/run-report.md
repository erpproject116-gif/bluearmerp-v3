# Live E2E run report

| Field | Value |
|-------|-------|
| Generated | 2026-09-16T03:43:04.220Z |
| Run ID | baseline-46bec17 |
| Tier | read-only |
| Base URL | (unset) |
| Smokeable routes | 261 |
| Manifest entries | 261 |
| Ticket drafts | 0 |
| Mutation ledger rows | 0 |

## Module inventory (smokeable)

| Module | Routes |
|--------|-------:|
| after-sales | 8 |
| crm | 14 |
| dashboard | 2 |
| documentation | 2 |
| finance | 58 |
| inventory | 43 |
| operations | 9 |
| other | 61 |
| production | 8 |
| purchase-order | 2 |
| purchase-request | 4 |
| purchases | 5 |
| quotation | 5 |
| sales | 17 |
| sales-order | 12 |
| support | 1 |
| user-management | 10 |

## Mutation ledger (E2E-* only)

_No mutations recorded (expected for read-only)._

## Ticket drafts (review before submit)

_No drafts. Run Playwright then `npm run e2e:tickets:draft`._

## Residual risks

- Green run ≠ all permissions/browsers/concurrency covered.
- Full route smoke may hit 429 on live; use paced batches.
- Posting tier requires proven reversal; never raw DELETE of posted docs.
- Migration 298 remains a separately reviewed data operation.

## Definition of done checklist

- [ ] Every manifest entry has evidence-backed state
- [ ] Allowed E2E-* mutations reconciled or reversed
- [ ] No pre-existing row altered
- [ ] Zero unexplained 5xx/schema/reconciliation failures
- [ ] Accepted findings have deduplicated Support tickets
- [ ] Regression suite green after fixes
