# Step 0 — Bluearm HR/Payroll Present vs Gap inventory

**Date:** 2026-10-31  
**Mode:** Read-only (no application code changed)  
**Product path:** Extend Bluearm HR only — no dual ERP

## Inventory table

| Area | Status | Evidence | Notes for enhance slices |
|------|--------|----------|---------------------------|
| Employee gov IDs (TIN/SSS/PHIC/HDMF) + tax_status | **Present** | `employees.go`; migration `161_hr_statutory_ph.sql` | Do not rebuild |
| Statutory packages table + seed | **Present** | `hr_statutory_packages` in `161_hr_statutory_ph.sql` (SSS Cir. 2024-006, PHIC 5%, HDMF, BIR TRAIN brackets) | Slice **A_rates**: currency vs *today’s* circulars = **Unknown** until accountant/source spike |
| Statutory compute (SSS/PHIC/HDMF/BIR WHT) | **Present** | `statutory.go` | Same as A |
| OT / night / holiday premiums | **Present** | `payroll_premiums.go` | Do not rebuild |
| 13th month / final pay | **Present** | `special_runs.go` | Do not rebuild |
| Payroll run / post / lock | **Present** | `payroll.go`, `payroll_depth.go` lock/unlock | Do not rebuild |
| Remittance batches build/list/status | **Present** | `remittance.go`; `RemittancesPage.tsx` | |
| Remittance CSV export (agency styles) | **Partial** | `hr_csv.go` — SSS labeled “R3-inspired… before official electronic file”; UI options `sss_r3`, `philhealth_erf`, `pagibig_mcrf`, `bir_1601c`, `generic` | Slice **B_remittance** needs official spec (else Blocker B-SPEC) |
| Official agency e-file byte layouts | **Absent / Unknown** | No verified official layout artifact in-repo | Blocks claiming “official” |
| 2316 field pack | **Partial** | `payroll_depth.go` tax certificate; `certified_efps: false` | Slice **C_bir_packs** |
| 1601-C spreadsheet pack | **Partial** | `GET /export-packs/1601c`; disclaimer not certified eFPS | Slice **C** |
| Employee alphalist CSV | **Partial** | `GET /export-packs/employee-alphalist`; not certified | Slice **C** |
| 1604-C pack | **Absent** | No `1604` symbol under `api/internal/modules/hr` or `web/src/modules/hr` (only mentioned in evaluation docs) | Candidate under **C_bir_packs** |
| Bank payout export API | **Present** | `bank-export` formats: `generic_csv`, `bdo_style`, `bpi_style` | Slice **D** needs owner bank + sample |
| Bank export UI | **Partial** | `PayrollRunsPage.tsx` opens only `format=generic_csv` — no UI for bdo/bpi | Related to **D** or small UI under **E**-adjacent |
| Remittance UI (build/export/filed) | **Present** | `RemittancesPage.tsx` | Slice **E_remittance_ui** = polish only if ranked |
| ESS + 2316-style self pack | **Present** | `ess.go` (`certified_efps: false`) | Keep disclaimer |
| Full HR route set | **Present** | `routes.go` | Baseline |

## Slice menu (Step 1 — owner must pick ONE)

| Id | Meaning | Depends on |
|----|---------|------------|
| `A_rates` | Prove/update statutory package rates + tests | Accountant or primary circulars |
| `B_remittance` | Improve remittance export toward official layout | Owner sample / official spec (else stay staging) |
| `C_bir_packs` | Extend BIR packs (e.g. 1604-C) still non-certified | Inventory Absent rows |
| `D_bank_template` | Named bank format + wire UI | Owner bank name + sample file |
| `E_remittance_ui` | Remittance UX only (labels, links to packs, honesty copy) | No official-file claim |

## Step 0 acceptance

- [x] Table written (this file)
- [x] No application code modified

## Step 1 status

**STOP — owner slice choice missing.**  
Reply with exactly one of: `A_rates` | `B_remittance` | `C_bir_packs` | `D_bank_template` | `E_remittance_ui`.

Until then Steps 2–7 are not started.
