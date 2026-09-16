# End-user UX friction baseline

Numbers below were measured, not estimated. They come from `web/e2e/end-user-ux.spec.ts`
run read-only against live Cordova (tenant 32, `app.bluearmerp.com`) on 2026-09-16,
evidence run id `live-cordova-20260916e`.

The machine-readable ceilings live in [`web/e2e/fixtures/ux-baseline.json`](../../web/e2e/fixtures/ux-baseline.json).
The spec reads that file and fails when a task does worse than its ceiling, so a UX
regression breaks a test instead of quietly shipping.

## What each task measures

A task starts on a list screen, finds the primary create control the way a first-time
user would (by visible label, not by URL), checks that the resulting screen announces
itself with a heading, and cancels back out. It records clicks, elapsed time, whether
help was reachable, and any friction it hit.

## Baseline, 2026-09-16

| Task | Start screen | Clicks | Elapsed | Friction recorded |
| --- | --- | --- | --- | --- |
| Create first quotation | `/app/quotation/quotations` | 2 | 4.2s | none |
| Receive a purchase order | `/app/purchases/purchase-receive` | 2 | 0.7s | none |
| Collect customer payment | `/app/finance/official-receipts` | 2 | 1.2s | none |
| Pay a supplier | `/app/finance/payment-vouchers` | 2 | 0.6s | goal heading not visible |
| Find stock on hand | `/app/inventory/find-stock` | 2 | 1.1s | goal heading not visible |

Across the five tasks: 2 clicks average, 1.6s average, 2 of 5 tasks carrying friction.

Elapsed time is recorded for trend-watching only. It is not asserted, because it moves
with network conditions and would produce flaky failures that teach people to ignore
the suite.

## The two open friction items

Both are the same shape: the create screen opens but never states what it is, so a
first-time user has no confirmation they landed where they meant to.

- **Pay a supplier.** No heading matching payment-voucher wording on the create screen.
- **Find stock on hand.** No heading on the stock lookup screen.

These are the only two failures the baseline tolerates. Fix either one, then drop its
`maxFriction` to `0` in the JSON so it can never come back.

## Hard rules that are never baselined

Two checks fail the run outright regardless of the baseline, because they are defects
rather than degrees of friction:

- **Internal module jargon.** `acct-i` / `acct-ii` are internal names. They must never
  reach a screen an end user sees.
- **Mixed invoice naming.** More than two distinct spellings of the same concept on one
  screen (Purchase Invoice / Purchase Receive / Supplier Invoice) means the user cannot
  tell whether they are looking at one thing or three.

## Re-measuring

```
npm run test:e2e:live:read-only -- e2e/end-user-ux.spec.ts
```

The run writes `ux-task-results.json` into the evidence directory for that run. Compare
it to the table above. When a fix lands, lower the ceiling in the JSON in the same PR as
the fix, so the improvement is locked in rather than merely observed.
