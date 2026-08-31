# S17 meat cut — demo script & deploy checklist

## Demo script (MVP)

1. Open **Production → Jobs (work orders)** — confirm Guide shows `Step n/m`.
2. Open **Recipes (BOMs)** → `DEMO-S17-BOM` (Cut apart): `S17WH` → `S17BL` / `S17PT` / `S17RB` (item codes are char(5)).
3. Confirm plant stock: whole lot `LOT-S17-WHOLE-1` (remaining after cut) and cut lots `LOT-S17-BELLY-*`, `LOT-S17-PATA-1`, `LOT-S17-RIBS-1`.
4. Customer orders: `DEMO-S17-SO-A` (belly → partner `M17A`), `DEMO-S17-SO-B` (pata → `M17B`).
5. Completed job `DEMO-S17-WO` with `actual_input_qty = 78`.
6. Pack: `DEMO-S17-PACK` linked to Cust A SO (= v1 box). Shipping: `DEMO-S17-SHIP-A`.
7. FEFO sale `DEMO-S17-SI` depleted older belly lot first.

**Honesty:** Stock qty/lots only — **no carcass→cut cost allocation** on disassembly complete.

## Deploy checklist (before claiming live)

1. Migrations through **279** applied (not merely recorded): include 270–276 manufacturing + 277 bulk perms + 278 migration kinds + 279 cut output lots.
2. ECS API binary includes manufacturing scan-context, output-lots, reports, Load Slip, quality WO inspection, bulk actions, migration boms/opening_lots.
3. Manufacturing route returns **401** when unauthenticated (not 404).
4. Run `scripts/seed-demo-golden-s17-meat-cut.sql` then `scripts/verify-demo-full-chain.sql` on target tenant(s).

## Process policies (recommended for meat demo)

Apply **Perishables warehouse** (FEFO + block expired) and **Production QC** as needed from Process policies. No separate meat preset in MVP.
