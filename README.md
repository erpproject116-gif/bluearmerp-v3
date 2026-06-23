# Bluearm ERP v3

Modular ERP MVP: **Go API** + **SolidJS SPA** + **Supabase** (Postgres + Auth).

## Scope (MVP)

- Google OAuth + demo sign-in
- Inventory master data: partners, locations, projects, departments, items
- Spreadsheet-style grids (F2 new, Enter edit, keyboard navigation)
- Tenant-scoped 5-digit codes via PostgreSQL sequences

## Repository layout

```
api/           Go + chi + pgx
web/           SolidJS + Vite + Tailwind v4
supabase/      CLI config, seed.sql
scripts/       Demo inventory seed, verify, bench
docs/          ADRs, runbooks, module READMEs
```

## Quick start (local)

1. Copy `.env.example` → `.env` at repo root — [environment-variables.md](./environment-variables.md).
2. **Apply schema and seed** — see [docs/runbooks/sql-run-order.md](docs/runbooks/sql-run-order.md):

   ```bash
   supabase db reset
   ```

3. **Link platform owners** — sign in with Google for each Gmail, then:

   ```bash
   psql "$DATABASE_URL" -f scripts/link-platform-owners.sql
   ```

4. **Link demo user** (optional) — [docs/runbooks/demo-seed-data.md](docs/runbooks/demo-seed-data.md).
5. **Start API:**

   ```bash
   cd api && go run ./cmd/server
   ```

6. **Start web:**

   ```bash
   cd web && npm install && npm run dev
   ```

7. Open http://localhost:5173/signin → **Continue with Google** (BLUEARM) or **Try free demo** (DEMO000).

## API health

```bash
curl http://localhost:8080/health
```

## Performance bench

```bash
node scripts/bench-api.mjs
# Mint CI/demo JWT (after scripts/seed-ci-bench-auth.sql):
BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs) node scripts/bench-api.mjs
```

Targets: **p95 < 400ms** local (warm); **p95 < 800ms** in CI. See [docs/performance/baseline-and-targets.md](docs/performance/baseline-and-targets.md).

Kill switches and tuning: [docs/adr/0004-performance-patterns.md](docs/adr/0004-performance-patterns.md).

## E2E smoke

```bash
cd web && npm run test:e2e
```

Requires running API + web + seeded demo user.

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/runbooks/environment-variables.md](docs/runbooks/environment-variables.md) | **Supabase-only env (no manual DATABASE_URL)** |
| [docs/runbooks/sql-run-order.md](docs/runbooks/sql-run-order.md) | Which SQL script to run first |
| [docs/runbooks/supabase-setup.md](docs/runbooks/supabase-setup.md) | New Supabase project |
| [docs/runbooks/demo-seed-data.md](docs/runbooks/demo-seed-data.md) | Seed + verify |
| [docs/runbooks/demo-sign-in.md](docs/runbooks/demo-sign-in.md) | Demo credentials |
| [docs/modules/inventory/README.md](docs/modules/inventory/README.md) | Inventory module |
| [docs/adr/](docs/adr/) | Architecture decisions |

## License

Proprietary — Bluearm ERP.
