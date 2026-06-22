# SQL scripts — run order

This is the **authoritative order** for database setup. Do not run inventory or link scripts before migrations and platform seeds.

## Overview diagram

```
Migrations (schema)
    ↓
supabase/seed.sql (catalog + DEMO000)
    ↓
scripts/seed-platform-owners.sql (BLUEARM + default superadmins)
    ↓
scripts/seed-demo-inventory.sql (DEMO000 inventory rows)
    ↓
[Create Auth users in Supabase]
    ↓
scripts/link-platform-owners.sql (Google → BLUEARM superadmins)  ← run first for your Gmail
scripts/link-demo-auth-user.sql (demo password user → DEMO000)   ← optional, for Try demo
    ↓
Verify scripts
```

---

## Phase 1 — Schema (migrations only)

**When:** Fresh database, first time only (or after schema changes).

**How (recommended):**

```bash
supabase db reset
```

`supabase db reset` applies migrations from `api/migrations/` in filename order, then runs seeds from `supabase/config.toml`.

**Manual equivalent (if not using `db reset`):**

Load connection for `psql` from your root `.env` — either set `DATABASE_URL` explicitly, or:

```bash
# Hosted: built from SUPABASE_URL + SUPABASE_DB_PASSWORD (see environment-variables.md)
export DATABASE_URL="postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres"
```

| Step | File | Purpose |
|------|------|---------|
| 1 | `api/migrations/001_platform.sql` | Tenants, users, modules, audit, code sequences |
| 2 | `api/migrations/002_inventory_master.sql` | `inv_*` master tables |
| 3 | `api/migrations/003_platform_access.sql` | `platform_users`, auto-enable future modules |
| 4 | `api/migrations/004_custom_fields.sql` | Custom field definitions + values |
| 5 | `api/migrations/005_form_field_settings.sql` | Standard field settings per tenant |
| 6 | `api/migrations/006_item_master_extended.sql` | Extended item columns for item picker |
| 7 | `api/migrations/007_repair_orders.sql` | Repair orders, lines, daily sequences |
| 8 | `api/migrations/008_repair_order_status.sql` | Line remark column, status-report index |
| 9 | `api/migrations/009_inv_stock_balances.sql` | Location-level inventory balances |
| 10 | `api/migrations/010_quotation_tax_mngt.sql` | Quotation module registry, tax types, currencies |
| 11 | `api/migrations/011_quotations.sql` | Quotations, lines, slips, attachments |
| 12 | `api/migrations/012_user_management.sql` | User Management module, tenant roles, invites |

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DATABASE_URL" -f api/migrations/001_platform.sql
psql "$DATABASE_URL" -f api/migrations/002_inventory_master.sql
psql "$DATABASE_URL" -f api/migrations/003_platform_access.sql
psql "$DATABASE_URL" -f api/migrations/004_custom_fields.sql
psql "$DATABASE_URL" -f api/migrations/005_form_field_settings.sql
psql "$DATABASE_URL" -f api/migrations/006_item_master_extended.sql
psql "$DATABASE_URL" -f api/migrations/007_repair_orders.sql
psql "$DATABASE_URL" -f api/migrations/008_repair_order_status.sql
psql "$DATABASE_URL" -f api/migrations/009_inv_stock_balances.sql
psql "$DATABASE_URL" -f api/migrations/010_quotation_tax_mngt.sql
psql "$DATABASE_URL" -f api/migrations/011_quotations.sql
psql "$DATABASE_URL" -f api/migrations/012_user_management.sql
```

**Do not skip migrations.** Seeds depend on tables created here.

---

## Phase 2 — Seed data (automatic with `db reset`)

**When:** After Phase 1. Runs automatically on `supabase db reset` in this order:

| Order | File | What it creates |
|-------|------|-----------------|
| 1 | `supabase/seed.sql` | `module_registry` (`core`, `inventory`), **DEMO000** tenant, demo user row |
| 2 | `scripts/seed-platform-owners.sql` | **BLUEARM** tenant, superadmins `itsjohnranel@gmail.com` + `bluearmph@gmail.com`, app owner `bluearmph@gmail.com`, all modules enabled |
| 3 | `scripts/seed-demo-inventory.sql` | Inventory dummy rows for **DEMO000** only |
| 4 | `scripts/seed-demo-quotations.sql` | Demo quotations for **DEMO000** + **BLUEARM** |

**Manual equivalent:**

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
psql "$DATABASE_URL" -f scripts/seed-platform-owners.sql
psql "$DATABASE_URL" -f scripts/seed-demo-inventory.sql
psql "$DATABASE_URL" -f scripts/seed-demo-quotations.sql
```

**Re-run safety:** All seed files use `ON CONFLICT` / idempotent patterns where possible.

---

## Phase 3 — Supabase Auth (Dashboard or Google sign-in)

**When:** After Phase 2. SQL cannot create Google OAuth users for your Gmail.

| Account | Purpose | How to create |
|---------|---------|---------------|
| `itsjohnranel@gmail.com` | Platform superadmin | Sign in once with **Google** on the app |
| `bluearmph@gmail.com` | Platform superadmin + BLUEARM app owner | Sign in once with **Google** |
| `demo@demo.bluearm.local` | Demo tenant only (optional) | Dashboard → Authentication → Add user + password |

---

## Phase 4 — Link Auth UUIDs to ERP profiles

**When:** After each account exists in `auth.users`.

### 4a. Platform superadmins (run this first for your Gmail accounts)

```bash
psql "$DATABASE_URL" -f scripts/link-platform-owners.sql
```

Or paste into Supabase SQL Editor.

**What it does:**

- Maps `itsjohnranel@gmail.com` → `public.users` on tenant **BLUEARM** + `platform_users` (`superadmin`)
- Maps `bluearmph@gmail.com` → same tenant + `platform_users` (`superadmin`) + `tenants.owner_user_id`
- Skips emails not yet in `auth.users` (sign in with Google, then re-run)

**Access granted:**

- All current modules (`core`, `inventory`, …)
- **Future modules** auto-enabled on BLUEARM via `tenants.auto_enable_all_modules` + DB trigger on `module_registry`

### 4b. Demo user (optional — for “Try free demo” button)

```bash
psql "$DATABASE_URL" -v auth_uuid="'<uuid-from-auth-users>'" -f scripts/link-demo-auth-user.sql
```

Only needed for `demo@demo.bluearm.local` on tenant **DEMO000**.

---

## Phase 5 — Verify

```bash
psql "$DATABASE_URL" -f scripts/verify-platform-owners.sql
psql "$DATABASE_URL" -f scripts/verify-demo-inventory.sql
```

**Expected for BLUEARM:**

| Email | `auth_linked` | `platform_role` | `auto_enable_all_modules` |
|-------|---------------|-----------------|---------------------------|
| `itsjohnranel@gmail.com` | `true` after link | `superadmin` | `true` |
| `bluearmph@gmail.com` | `true` after link | `superadmin` | `true` |

---

## Quick reference: which script when?

| I want to… | Run this |
|------------|----------|
| Set up everything from scratch | `supabase db reset` then Phase 3–4 |
| Add schema only | Migrations 001 → 002 → 003 |
| Add BLUEARM owners after reset | `scripts/seed-platform-owners.sql` |
| Link my Google account | `scripts/link-platform-owners.sql` |
| Load demo inventory data | `scripts/seed-demo-inventory.sql` |
| Link demo password user | `scripts/link-demo-auth-user.sql` |
| Check superadmin setup | `scripts/verify-platform-owners.sql` |
| Fix linked Gmail missing superadmin | `scripts/repair-platform-owners.sql` |
| Check demo inventory counts | `scripts/verify-demo-inventory.sql` |

---

## Tenants at a glance

| Code | Purpose | Default users |
|------|---------|---------------|
| `BLUEARM` | Production / operator tenant | `bluearmph@gmail.com` (owner), `itsjohnranel@gmail.com` |
| `DEMO000` | Public demo / training data | `demo@demo.bluearm.local` |

Sign in with Google as either Gmail → lands on **BLUEARM** (after link). Use **Try free demo** → **DEMO000**.

---

## Related docs

- [supabase-setup.md](./supabase-setup.md) — create Supabase project + env vars
- [demo-seed-data.md](./demo-seed-data.md) — DEMO000 inventory checklist
- [demo-sign-in.md](./demo-sign-in.md) — demo password credentials
