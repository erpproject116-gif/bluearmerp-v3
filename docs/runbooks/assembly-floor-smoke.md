# Assembly floor smoke checklist

Manual checks after deploying migration `289_mfg_bom_cost_and_assembly_code.sql` and web/API.

## 1. Plain Finish build (no serial/lot, QC off)

1. Create Assembly recipe: Description + FG + Warehouse + one part → Save.
2. Confirm recipe code matches `Ammddyyyy-######` (e.g. `A09102026-000001`) and was not typed.
3. New job from that recipe; optional link SO.
4. On Jobs (Open): row shows Planned; Produced 0; Transacted at; no Quality column.
5. **Finish build** on draft → confirm Actual produced (default planned) → success.
6. Job moves to Done; Produced = actual; stock: parts down, FG up.
7. Reports → Job status: Produced + Source SO if linked.

## 2. Lot / serial FG

1. Job with lot- or serial-tracked FG.
2. Continue → Record finished → stage qty/serials.
3. Done — back to Finish build → Finish build.
4. Produced matches staged count/qty.

## 3. Reports

1. Progress: Recipe (`bom_code`) + Source SO columns populated when linked.
2. Stock movements: Source SO when WO linked.

## 5. Manufacturing dashboard + 3-step Assembly order (PDF Phase 1)

1. Open Manufacturing → Dashboard: KPIs, type cards, recent orders, shortages load from API.
2. Assembly card → 3-step wizard: Save draft with shortage allowed; Assemble & Post blocked when short.
3. Plain FG (no serial): Assemble & Post completes and updates stock.
4. Serial/lot FG or parts: Assemble & Post starts job and opens Take materials / Record finished.
5. Cutting card → Disassembly jobs; Recipe card → Coming soon.
6. Sidebar shows Manufacturing with Dashboard / All Production / Assembly / Cutting / Recipe / QC / History / Reports / Setup.
