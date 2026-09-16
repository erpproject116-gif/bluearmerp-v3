# Live E2E run report

| Field | Value |
|-------|-------|
| Generated | 2026-09-16 |
| Run IDs | `live-cordova-20260916c` (suite), `…16d` (form retest), `…16e` (UX retest) |
| Tenant | Cordova Computer Hub (`tenantId` 32) — **not DEMO000** |
| Account | Live operator account (signed-in browser session) |
| API schema | healthy; `latest_migration=300_sa_sales_delivery_remarks.sql`; `pending_count=0` |
| Tier | **read-only** (no business mutations; Support tickets only) |
| Smokeable routes / manifest | 261 |
| Playwright (c) | **14 passed, 1 failed** (form heading expected `New Sales Invoice`; live UI is `New Sales`) |
| Playwright (d) | form contracts **3 passed** after harness label fix |
| Mutation ledger | empty (read-only) |

## Support tickets filed (after E2E search dedupe — no prior `[E2E]` rows)

| TK | ID | Subject |
|----|----|---------|
| TK-20260916-007 | 149 | Sales invoice screen uses ambiguous “Sales Sales Sales” labels |
| TK-20260916-008 | 150 | Purchase Receive naming confuses invoice vs stock receive |
| TK-20260916-009 | 151 | Quotation form uses jargon labels Date-no, Location-Out, PIC |
| TK-20260916-010 | 152 | Customers & vendors vs Customers/Vendors naming; list tabs all current |

## Harness adjustments from live Cordova

- Smoke sign-in accepts already-authenticated redirect away from `/signin`
- Partners heading allows `Customers & vendors`
- Form contracts accept `New Sales` / `New Purchase Receive`
- UX tasks wait for shell + broader New-button patterns; receive starts at Purchase Receive

## Residual risks

- Full 261-route smoke not re-run this pass (pacing / duration)
- Reversible/posting tiers not executed on Cordova (requires explicit confirm)
- UX evidence from run `c` had false friction (harness raced page load); retest `e` addresses that
- Auth `e2e/.auth/user.json` remains local/gitignored — do not commit

## Definition of done

- [x] Live Cordova read-only pass on contracts / chains / smoke / coverage
- [x] Observed findings → reviewed Support tickets with TK IDs
- [x] Manifest + mutation guard remain in place
- [ ] Full route smoke + reversible/posting when operator confirms
