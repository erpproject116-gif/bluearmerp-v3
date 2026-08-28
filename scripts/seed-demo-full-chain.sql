-- Full demo seed orchestrator (psql ONLY — not Supabase SQL Editor)
-- Supabase SQL Editor does not support \echo or \ir. Run each script below manually, in order,
-- or use User Management → Demo Data in the app (after migration 056).
-- See docs/runbooks/sql-run-order.md Phase 2 for the file list.
--
-- Prerequisites: migrations through 055 applied (especially 052 finance AP, 054 qty_reserved, 055 DR).
--
--   psql "$DATABASE_URL" -f scripts/seed-demo-full-chain.sql
--
\echo '=== seed-demo-full-chain: quotations ==='
\ir seed-demo-quotations.sql
\echo '=== seed-demo-full-chain: purchase requests ==='
\ir seed-demo-purchase-requests.sql
\echo '=== seed-demo-full-chain: sales orders ==='
\ir seed-demo-sales-orders.sql
\echo '=== seed-demo-full-chain: golden scenarios ==='
\ir seed-demo-golden-scenarios.sql
\echo '=== seed-demo-full-chain: golden S13 perishable ==='
\ir seed-demo-golden-s13-perishable.sql
\echo '=== seed-demo-full-chain: open PO/GR ==='
\ir seed-demo-po-gr-open.sql
\echo '=== seed-demo-full-chain: sales ==='
\ir seed-demo-sales.sql
\echo '=== seed-demo-full-chain: finance ==='
\ir seed-demo-finance.sql
\echo '=== seed-demo-full-chain: finance AP ==='
\ir seed-demo-finance-ap.sql
\echo '=== seed-demo-full-chain: CRM ==='
\ir seed-demo-crm.sql
\echo '=== seed-demo-full-chain: dashboard red flags ==='
\ir seed-demo-dashboard.sql
\echo '=== seed-demo-full-chain: verify golden chains ==='
\ir verify-demo-full-chain.sql
\echo '=== seed-demo-full-chain: complete ==='
