# Inv. II — Quality Control

**Module path:** Inv. II → **Quality Control**  
**Default screen:** Quality Insp. Request List (`prgId=C000093`)  
**Bluearm target:** `/app/qms` (future)  
**Audit status:** pass 2 — live crawl Jul 7 2026

## L0 module tab

Clicking **Quality Control** under Inv. II opens QC left menu; default workspace = **Quality Insp. Request List**.

See detailed screen notes: `screens/C000093-qc-request-list.md`.

## Left menu (Quality Control subtree)

### Quality Insp. Request
| Program | prgId | Notes |
|---------|-------|-------|
| Create Quality Insp. Request | — | Bulk/create action |
| New Quality Insp. Request | — | Entry form |
| Quality Insp. Request List | C000093 / E040629 | Transaction list — **live crawled** |
| Quality Insp. Request Status | — | Status inquiry |
| Uninspected Status | — | Items/docs awaiting inspection |

### Quality Inspection
| Program | prgId | Notes |
|---------|-------|-------|
| New QC Insp. Type | — | Setup inspection type |
| New Quality Inspection | — | Entry form |
| Quality Inspection List | E040622 | Transaction list — **live crawled**; 4 status pills |
| Quality Inspection Status | — | Status inquiry |

## List status pills (live)

| List | Pills |
|------|-------|
| QC Request List (C000093) | All / e-Approval / Confirm / In Progress / Completed |
| QC Inspection List (E040622) | All / In Progress / Completed / History |

Differs from Inv. I Sales/Purchase (**All / e-Approval / Unconfirmed / Confirm**).

## Toolbar (QC lists)

New (F2), Email, Change Status, Send, Print, Barcode (Item), e-Approval, Delete Selected, Excel

## Cross-links from Inv. I

Purchase/sales line menus expose **Create Quality Insp. Request** (seen on E040303 New Purchases row context).

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| QC request from purchase/GR line | Not wired |
| QC inspection types | — |
| Uninspected Status report | — |
| 5-pill QC status filters | Not implemented |

## Tab pill checklist

- [x] L0 Quality Control tab (Inv. II)
- [x] QC Request List status pills
- [x] QC Inspection List status pills (E040622 — **4-pill set**: All/In Progress/Completed/History)
- [ ] New QC Insp. Request form tabs
- [ ] New Quality Inspection form tabs
