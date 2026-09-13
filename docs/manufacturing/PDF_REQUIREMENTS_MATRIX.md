# BLUEARM Manufacturing PDF — requirements matrix

Source: `BLUEARM Manufacturing suggestion.pdf` (§1–69).  
Update this file in any PR that touches manufacturing. Status: `done` | `partial` | `deferred` | `na-v1`.

| ID | PDF | Rule (one line) | Phase | Status | Code anchors | Test |
|----|-----|-----------------|-------|--------|--------------|------|
| S01 | Menu | One Manufacturing module; shared architecture | 1 | partial | `ecount-top-nav.ts`, routes `/app/production/*` | `productionNav.test.ts` |
| S02 | Dashboard | Live KPIs + recent + shortages + activity | 1 | done | `dashboard.go`, `ProductionHubPage.tsx` | API + hub load |
| S03 | Quick actions | New PO primary; setup/history/reports shortcuts | 1 | done | `ProductionHubPage.tsx` | manual |
| S04 | Common PO engine | Shared order fields / types ASSEMBLY·CUTTING·RECIPE | 1–3 | done | WO + Assembly/Cutting/Recipe wizards | — |
| S05 | Statuses | Draft→…→Completed/Cancelled/Reversed | 1 | partial | WO `draft/released/completed/cancelled` aliases | `posting_rules_test.go` |
| S06 | Central posting | Via inventory ledger only | 1 | done | `completeWorkOrder` → `ApplyStockDelta` / trace | existing WO tests |
| S07 | When stock moves | Only on authorized post | 1 | done | release no stock; complete posts | `posting_rules_test.go` |
| S08–S16 | Assembly | BOM, version snapshot, 3-step UI, shortage, partial, QC, serials | 1 | partial | wizard + BOM + stations; partial/QC later | wizard + `mfgRules.test.ts` |
| S17–S21 | Cutting / yield / waste class | Templates, 3-step UI, waste class no sellable stock | 2 | done | `disassembly` BOM + `NewCuttingOrderWizard` + `output_classification` | `posting_rules_test.go` |
| S22–S25 | Waste reasons / normal vs abnormal | Reasons master; excess/abnormal requires reason | 2 | partial | `mfg_waste_reasons`, `ValidateWasteLine`; GL deferred | posting_rules + mfgRules tests |
| S26–S30 | Costs | Expense lines, summary, valuation, cutting alloc | 4 | partial | immutable WO material/labor/overhead/other cost snapshot + FG capitalization; cutting stores aggregate input value, not per-output allocation | `accounting_test.go` |
| S31–S33 | Recipe + accounting | Recipe master + batch/yield wizard; journals later | 3–4 | done | `bom_type=recipe`, wizard journal preview, completion JE when Inventory GL is enabled | `accounting_test.go`, normalizeBomType tests |
| S34–S35 | Waste/yield reports | Yield bands + waste variance | 2 | done | `reports.go`, Cutting yield + Waste & variance tabs | — |
| S36 | Profit readiness | Store costs for later | 4 | done | `mfg_work_order_cost_postings` immutable cost snapshot | `accounting_test.go` |
| S37 | Production setup | BOM / yield / recipes hub | 1–2 | partial | setup + waste reasons link | — |
| S38–S39 | QC screens / hold | Pending/passed/failed; QC Hold inventory | 4 | done | Quality WO inspection + `manufacturing_require_fg_qc` enforced before atomic stock post | `posting_rules_test.go` |
| S40 | Production history | Unified list + filters | 1 | partial | All Production → jobs list | — |
| S41 | Numbering | ASM-/CUT-/REC- prefixes | 2 | done | `allocateWorkOrderNo` ASM/CUT/REC | posting_rules_test |
| S42–S44 | Reversal / cancel | Reverse after post; cancel before | 1/4 | done | immutable `mfg_work_order_reversals`; inverse stock/trace + reversing JE; completed WO retained | `accounting_test.go` |
| S45 | Approval | Optional production approval | 4 | deferred | submit perms only | — |
| S46 | Reservation | Reserve on confirm | 4 | deferred | staging ≠ reservation | — |
| S47 | Negative inventory | Default OFF; block post | 1 | done | `ApplyStockDelta` + shortage gate | `mfgRules.test.ts` |
| S48 | Shortage policy | Dashboard shortage drill-down | 1 | done | `dashboard.go` shortages | — |
| S49–S50 | Expense vs waste | Structured costs; waste separate | 2/4 | done | labor/overhead/other cost snapshot separate from waste lines | `accounting_test.go` |
| S51 | Audit trail | Create/edit/post/… | 1 | partial | `audit.Log` on release/complete/revert | — |
| S52 | Permissions | Granular mfg perms | 1 | partial | existing manufacturing.* | — |
| S53 | Edit policy | Draft editable; completed read-only | 1 | done | `canEditWorkOrder` | `mfgRules.test.ts` |
| S54–S55 | Lot / dual UOM | Trace + catch weight readiness | 4 | partial | staging lots; UOM on BOM | — |
| S56 | Reports landing | Card grid, not sidebar spam | 1–2 | partial | `/app/production/reports` tabs | — |
| S57–S58 | Dashboard UI / type cards | Type cards blue/green/orange | 1 | done | hub type cards | — |
| S59–S61 | Post validations / atomic / idempotent | Checklist + txn; idempotent later | 1 | partial | complete txn; unique post key deferred | `posting_rules_test.go` |
| S62–S63 | Operator vs manager UX | Short path vs reports | 1–2 | done | `OPERATOR_FLOW.md` + wizards | — |
| S64–S66 | Core inventory/cost/waste rules | Type-specific stock + waste classes | 1–2 | partial | assembly + cutting posting | — |
| S67 | Implementation priority | Phases 1–4 | 1–2 | done | this matrix | — |
| S68 | No over-engineer V1 | No MRP/routing/capacity | 1 | done | na-v1 | — |
| S69 | Final objective | Simple + accurate stock/cost/waste/trace | 1–2 | partial | Phase 1–2 shell | — |

## Phase 1–3 acceptance anchors

- Floor words primary: **Save draft**, **Assemble & Post**, **Post Production**, **Process & Post**.
- Cutting card → Cutting wizard; Recipe card → Recipe wizard.
- Waste-classified BOM lines do not increase sellable stock.
- Apply migrations `290_mfg_cutting_waste.sql`, `291_mfg_recipe_type.sql`, `292_mfg_recipe_bom_code.sql`, and `293_mfg_phase4_posting.sql` before using those features in prod.
