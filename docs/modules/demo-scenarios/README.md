# Golden demo scenarios

Wired document chains for QA, training, and `verify-demo-full-chain.sql`.

## Catalog

See `scripts/fixtures/demo-scenarios.yaml` for stable document numbers.

| ID | Chain | Key documents |
|----|-------|---------------|
| S2 | Serial purchase → sale | `DEMO-S2-PR` → PO → GR → SO → SI |
| S3 | Lot purchase → direct SI | `DEMO-S3-PR` → PO → GR lot → `DEMO-S3-SI` |
| S4 | Direct sale (skip SO) | `DEMO-S4-SI` |
| S5 | Open receive UI | `DEMOGR902`–`905` (`seed-demo-po-gr-open.sql`) |
| S8 | AP partial pay | `DEMO-S8-AP`, `DEMO-S8-PV` against S3 GR |
| S9 | Reserve → DR → SI | `DEMO-S9-SO` → `DEMO-S9-DR` → `DEMO-S9-SI` |
| S10 | PR approval | `DEMO-S10-PR`, `DEMO-S10-PR-OK` → `DEMO-S10-PO` |
| S11 | Operations Hub demo | Workspace `demo-riverside-reno` (Construction pack) |
| S12 | Communications demo | Sent messages `DEMO-COMMS-*` + stub inbox threads |
| S13 | Perishable catch-weight FEFO | `DEMO-S13-PR` → PO → GR (2 lots) → `DEMO-S13-SI` (FEFO) |

## Run order

Included automatically in `supabase db reset` via `supabase/config.toml`:

1. `seed-demo-golden-scenarios.sql`
2. `seed-demo-golden-s13-perishable.sql`
3. `seed-demo-finance-ap.sql` (S8)
3. `scripts/verify-demo-full-chain.sql` (post-seed gate)

Manual:

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-full-chain.sql
psql "$DATABASE_URL" -f scripts/verify-demo-full-chain.sql
```

In-app (DEMO000 / BLUEARM, migration 056):

1. **User Management → Demo Data → Populate demo data** (optionally purge first).
2. Status panel shows golden scenario checks when seeds succeed.

Purge only:

```bash
psql "$DATABASE_URL" -f scripts/purge-demo-data.sql
```

## Verification checklist

After `db reset`:

1. `verify-demo-full-chain.sql` completes without exceptions.
2. **S2** — Serial trace shows GR → reserve → sold for `{tenant}-S2-*` units.
3. **S3** — Lot `LOT-S3-A` on SI line; GR posted qty 50.
4. **S8** — Supplier invoice against S3 GR; partial payment ₱30,000.
5. **S9** — Delivery receipt posted; SI linked to SO line.
6. **S10** — Pending PR in `e_approval`; approved PR has PO.
7. **S11** — Operations → Work Hub shows `demo-riverside-reno` workspace with Kanban cards after demo populate.
8. **S12** — Communications → Sent Documents shows `DEMO-COMMS-*` sample emails.
9. Dashboard red flags — serial mismatch from `seed-demo-dashboard.sql`; S2 may show “released, not delivered” until DR posted in legacy tenants.

## Process policies

Defaults are skip-friendly (`legacy_combined_so_release = true`). Toggle in **User Management → Process Policies** to test strict gates.
