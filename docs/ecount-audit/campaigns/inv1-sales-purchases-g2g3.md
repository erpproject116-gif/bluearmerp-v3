# Campaign A — Inv. I Sales + Purchases (G2 then G3)

_Generated inventory. Target rows: **46**._

## Gate rules for this campaign

- **G2 PASS (scope):** every row below is `depth-complete` (all pills audited, toolbar >=95%).
- **G3 PASS (scope):** every P1 row is `parity` | `partial`+residual | `deferred`+reason — **0 silent missing**.
- Do not implement residuals until G2+G3 pass for this scope.

### Progress tracker

| Date | depth-complete | still open | P1 silent missing |
|------|---------------:|-----------:|------------------:|
| Jul 28 batch 1 | 25 / 46 | 21 | 20 |

| status | count |
|--------|------:|
| depth-complete | 25 |
| cataloged | 20 |
| in-progress | 1 |

| bluearm_parity | count |
|----------------|------:|
| partial | 26 |
| missing | 20 |

**P1 rows:** 46 · **P1 silent missing:** 20

## Work queue (not depth-complete)

| prgId | L2 | screen | status | parity | pri | tabs |
|-------|----|--------|--------|--------|-----|------|
| E040311 | Purchases | Change Purchases Price-Batch | cataloged | missing | P1 | 0/0 |
| E040312 | Purchases | Collective Invoicing (Purchase) | cataloged | missing | P1 | 0/0 |
| C000031 | Purchases | Purchase List | in-progress | partial | P1 | 6/11 |
| E040317 | Purchases | Purchase Plan List | cataloged | missing | P1 | 0/0 |
| C000078 | Purchases | Purchases | cataloged | missing | P1 | 0/0 |
| C000096 | Purchases | Purchases | cataloged | missing | P1 | 0/0 |
| E040323 | Purchases | RFQ Progress Status | cataloged | missing | P1 | 0/0 |
| E040325 | Purchases | RFQ Status | cataloged | missing | P1 | 0/0 |
| E060607 | Sales | Checks Issued List | cataloged | missing | P1 | 0/0 |
| E060608 | Sales | Checks Issued Status | cataloged | missing | P1 | 0/0 |
| E060603 | Sales | Checks Received List | cataloged | missing | P1 | 0/0 |
| E060604 | Sales | Checks Received Status | cataloged | missing | P1 | 0/0 |
| E060612 | Sales | Decrease of Issued Checks Balance | cataloged | missing | P1 | 0/0 |
| E060610 | Sales | Decrease of Received Checks Balance | cataloged | missing | P1 | 0/0 |
| E060611 | Sales | Increase of Issued Checks Balance | cataloged | missing | P1 | 0/0 |
| E060614 | Sales | Issued Check Transactions | cataloged | missing | P1 | 0/0 |
| E060606 | Sales | New Issued Check Clearance | cataloged | missing | P1 | 0/0 |
| E060602 | Sales | New RCVD. Check Payment | cataloged | missing | P1 | 0/0 |
| E060613 | Sales | Received Check Transactions | cataloged | missing | P1 | 0/0 |
| C000073 | Sales | Sales | cataloged | missing | P1 | 0/0 |
| C000095 | Sales | Sales | cataloged | missing | P1 | 0/0 |
