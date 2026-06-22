# Demo seed data runbook

> **SQL run order:** See [sql-run-order.md](./sql-run-order.md) for the full migration → seed → link sequence.

This runbook covers the **DEMO000** demo tenant. For platform superadmins (`itsjohnranel@gmail.com`, `bluearmph@gmail.com` on **BLUEARM**), use `scripts/seed-platform-owners.sql` and `scripts/link-platform-owners.sql` instead.

## Prerequisites

- Supabase CLI installed (`supabase --version`)
- Docker running (for `supabase start`)
- Migrations in `api/migrations/` applied

## Run order

1. **Start local Supabase** (optional if using hosted project):

   ```bash
   supabase start
   ```

2. **Reset database** (applies migrations + seeds):

   ```bash
   supabase db reset
   ```

   Seeds run in order per `supabase/config.toml`:

   | Order | File | Purpose |
   |-------|------|---------|
   | 1 | `supabase/seed.sql` | Module catalog, DEMO000 tenant, demo user row |
   | 2 | `scripts/seed-platform-owners.sql` | BLUEARM tenant + default superadmin owner rows |
   | 3 | `scripts/seed-demo-inventory.sql` | All `inv_*` rows for DEMO000 + sequence sync |
   | 4 | `scripts/seed-demo-quotations.sql` | Demo quotations (5 per tenant) for DEMO000 + BLUEARM |

3. **Optional — quotation demo data** (after inventory seed):

   ```bash
   psql "$DATABASE_URL" -f scripts/seed-demo-quotations.sql
   psql "$DATABASE_URL" -f scripts/verify-demo-quotations.sql
   ```

   Expected for DEMO000 after quotation seed:

   | Entity | Count |
   |--------|-------|
   | quotations | 5 |
   | quotation lines | 6 |
   | tax types (active) | 5 |

4. **Create Supabase Auth user** (Dashboard → Authentication → Users, or CLI):

   - Email: `demo@demo.bluearm.local`
   - Password: `DemoBluearm2026!` (local dev only; see `docs/runbooks/demo-sign-in.md`)

4. **Link Auth UUID to `public.users`:**

   ```bash
   psql "$DATABASE_URL" -v auth_uuid="'<paste-auth-users-id>'" -f scripts/link-demo-auth-user.sql
   ```

   Or edit `scripts/link-demo-auth-user.sql` and run in SQL editor.

5. **Verify row counts:**

   ```bash
   psql "$DATABASE_URL" -f scripts/verify-demo-inventory.sql
   ```

   Expected counts for DEMO000:

   | Entity | Active rows | Total (incl. inactive) |
   |--------|-------------|-------------------------|
   | partners | 11 | 12 |
   | locations | 7 | 8 |
   | projects | 6 | 7 |
   | departments | 7 | 8 |
   | items | 14 | 15 |

6. **Next codes after seed** (for F2 create):

   | Entity | Next code |
   |--------|-----------|
   | partners | `00013` |
   | locations | `00009` |
   | projects | `00008` |
   | departments | `00009` |
   | items | `00016` |

## Google sign-in (platform owners)

1. Enable Google provider in Supabase Dashboard.
2. Add redirect URL: `http://localhost:5173/auth/callback`
3. Sign in once with `itsjohnranel@gmail.com` and `bluearmph@gmail.com`.
4. Run `scripts/link-platform-owners.sql` — see [sql-run-order.md](./sql-run-order.md).

## Feature test checklist

| Feature | What to verify |
|---------|----------------|
| Partners grid | 12 rows; Kind=vendor filter → 4; search `Steel` → 00004; inactive 00012 hidden when status=active |
| Locations grid | All 3 location types; O/E factories 00004–00005; inactive 00008 |
| Projects grid | 6 active jobs; click code 00003 opens edit modal |
| Departments grid | 7 active depts; F2 suggests code `00009` |
| Items grid | Sort by Sales price; VIP < Sales on active SKUs |
| F2 create | Next code = max+1 per entity |
| Search `q` | `Makati` → location 00001; `Sofa` → item 00001 |
| Demo sign-in | **Try free demo** → `/app/inventory/partners` with seeded rows |
| Quotation list | Sidebar **Quotation** → 5 demo quotes (SM, Seda, Ayala, Robinsons, Vista) |
| Quotation Status | F8 search → line-level rows across seeded quotes |
| Outstanding | Quote D (Robinsons) has balance qty 2 on oak panel with stock at HQ |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `GET /api/v1/auth/me` returns 401 | Link `auth_user_id` via `link-demo-auth-user.sql` |
| Empty grids | Run `supabase db reset` or re-run `seed-demo-inventory.sql` |
| Empty quotation list | Run `scripts/seed-demo-quotations.sql` (requires migrations 010–011) |
| F2 shows `00001` again | Re-run sequence sync block at end of `seed-demo-inventory.sql` |
