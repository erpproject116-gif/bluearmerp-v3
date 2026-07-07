# E040622 — Quality Inspection List

**Menu path:** Inv. II → **Quality Control** → Quality Inspection → Quality Inspection List  
**URL:** `prgId=E040622`, `menuSeq=MENUTREE_000739`, `groupSeq=MENUTREE_000209`  
**Bluearm target:** `/app/qms/inspections` (future)  
**Audit status:** pass 1 — live crawl Jul 7 2026

## L2 status filter pills (list header)

**Different from QC Request List** — inspection uses a 4-pill workflow set:

| Pill | Purpose |
|------|---------|
| All | All inspection documents |
| In Progress | Inspection underway |
| Completed | Closed inspections |
| History | Historical / archived view |

**No e-Approval or Confirm pills** on this list (unlike QC Request List and Inv. I transactional lists).

## Toolbar

New (F2), Email, Change Status, Send, Print, Barcode (Item), **Generate Other Slips**, Delete Selected, Excel

**Notable vs QC Request List:** no **e-Approval** button; adds **Generate Other Slips** and explicit **Excel**.

## Option filter (Default pill)

| Field | Notes |
|-------|-------|
| Date | Simple Search — Recent 30 Days (+1 Month) default |
| QC Inspection No. | Document number |
| Item | With category radios: All, Raw Material, Sub Material, Finished Goods, Semi-Finished Goods, Merchandise, Intangible Merchandise; Include Sub-groups |
| Location | Include Sub-groups |
| Project | Project code |
| Source Type (Request) | Linked QC request origin |
| Delete Type | All / Undeleted / Delete |
| Others | Sort by Modified Date |
| Send Status | All / Unsent / Send |
| Inspection result (Option sub-filters) | All / Not applicable / **Pass** / **Fail** |
| Inspection method | All / **Sampling** / **Lot** |
| Applied Template | Default (Not Editable) |

## New document entry

| Action | Route |
|--------|-------|
| Toolbar **New (F2)** | List settings / quick entry (verify vs left menu) |
| Left menu **New Quality Inspection** | Entry form (not crawled this pass) |

## Tab pill checklist

- [x] L2 status pills (All / In Progress / Completed / History)
- [x] Option Default pill + result/method sub-filters
- [ ] List Tab Settings pills (1–6) if configured
- [ ] New Quality Inspection form tabs
- [ ] Generate Other Slips modal

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| QC inspection list + 4 status pills | Not implemented |
| Pass/Fail result filters | QMS inspection outcomes |
| Sampling vs Lot method | Inspection type enum |
| Generate Other Slips from inspection | Downstream doc generation |

## Cross-reference

QC Request List uses **5 pills** (All / e-Approval / Confirm / In Progress / Completed) — see `C000093-qc-request-list.md`.
