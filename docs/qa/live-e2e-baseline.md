# Live E2E baseline (freeze evidence)

Captured for **Cordova Computer Hub** live tenant using signed-in Browser Tab `721f86`.

| Field | Value |
|-------|-------|
| Captured at | 2026-09-16 |
| Git SHA | `46bec17` |
| API schema | `healthy: true`, `pending_count: 0`, `latest_migration: 300_sa_sales_delivery_remarks.sql` |
| Live web | `https://app.bluearmerp.com` |
| Account | Live operator account (user id 60); credentials only in gitignored `web/e2e/.auth/user.json` |
| Tenant | **Cordova Computer Hub** (`TRIAL-90f0ad`, tenant id **32**, `is_demo: false`) |
| Branch UI | Backroom / Service Bench, Main, Main Store - Cordova |
| Auth artifact | gitignored `web/e2e/.auth/user.json` (exported from live tab; do not commit) |
| Tenant fixtures | `web/e2e/fixtures/tenant-profile.local.json` |
| Default live tier | **read-only** |
| Mutation policy | Creates only with `E2E-<run-id>` + ledger; never edit first existing row |

## Enabled modules (sample)

inventory, quotation, sales_order, sales, purchase_order, purchases, finance (+ acct_i/ii, payment_vouchers), support, manufacturing, crm, after_sales, pos, hr, and others (`auto_enable_all_modules: true`).

## Stop conditions

1. Unexpected change to a non-`E2E-*` existing record  
2. `/health/schema` unhealthy  
3. Wrong tenant / auth scope drift (expect `TRIAL-90f0ad` / Cordova)  
4. Repeated 429 after one wait window  
5. Unexplained 5xx burst  
6. Reconciliation mismatch after posting  
7. Mutation while tier is `read-only`

## Lookup fixtures (this tenant)

| Role | Query seed |
|------|------------|
| Customer | Cordova Tech |
| Supplier | Visayas Tech |
| Item | USB-C |
| Location | Cordova |
