# C000093 / E040629 — Quality Insp. Request List

**Menu path:** Inv. II → **Quality Control** → Quality Insp. Request List  
**URL (QC tab default):** `prgId=C000093`, `menuSeq=MENUTREE_000209`  
**URL (menu click):** `prgId=E040629`, `menuSeq=MENUTREE_000737`  
**Bluearm target:** `/app/qms` (future)  
**Audit status:** pass 1 — live crawl Jul 7 2026

## L0 module tab

Inv. II L0 tabs: After-Sales Service, Serial/Lot No., **Quality Control**, Plan Mgmt, Costing, Order Mgmt, Export, WMS.

**Default on QC tab open:** Quality Insp. Request List (`C000093`).

## Left menu — Quality Insp. Request (L1)

| Program | Notes |
|---------|-------|
| Create Quality Insp. Request | Bulk/create action |
| New Quality Insp. Request | Entry form |
| **Quality Insp. Request List** | This screen |
| Quality Insp. Request Status | Status inquiry |
| Uninspected Status | Awaiting inspection |

## Left menu — Quality Inspection (L1)

| Program | prgId (menu click) |
|---------|-------------------|
| New QC Insp. Type | (setup) |
| New Quality Inspection | (form) |
| Quality Inspection List | E040622 |
| Quality Inspection Status | (status) |

## L2 status filter pills

QC lists use a **5-pill** pattern (not Inv. I sales/purchase 4-pill):

| Pill | Purpose |
|------|---------|
| All | All documents |
| e-Approval | Pending approval |
| Confirm | Confirmed / ready |
| In Progress | Inspection underway |
| Completed | Closed inspections |

**Note:** No **Unconfirmed** pill — differs from Sales/Purchase lists.

## Toolbar

New (F2), Email, Change Status, Send, Print, Barcode (Item), e-Approval, Delete Selected, Excel

**New (F2)** = list settings menu (same pattern as Inv. I transactional lists).

## Option filter (Default pill)

| Field | Notes |
|-------|-------|
| Date | Set Manually (default ~2-month window seen) |
| QC Insp. Request No. | Document number |
| Location | Warehouse |
| Customer | Party |
| Item | Product filter |
| Project | Project code |
| Mgmt Field | Custom mgmt field |
| PIC | Person in charge |
| PIC for Customer/Vendor | Party PIC |
| Remark | Text search |
| Last Modifier | Audit filter |
| Send Status | All / Unsent / Send |
| Applied Template | Default (Not Editable) |

## Tab pill checklist

- [x] L0 Quality Control module tab
- [x] QC Request List status pills (5-pill set)
- [x] Option Default pill
- [ ] Quality Inspection List (E040622) — separate pass; same pill pattern expected
- [ ] New Quality Insp. Request form tabs
- [ ] New Quality Inspection form tabs

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| QC request list + 5 status pills | Not implemented |
| Create QC from purchase/GR line | Not wired |
| Uninspected Status report | — |
| QC inspection types | — |
