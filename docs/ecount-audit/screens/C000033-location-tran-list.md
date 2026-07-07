# C000033 — Location Tran. List (Inv. Mov. default)

**Menu path:** Inv. I → **Inv. Mov.** (L0 module tab) → Location Tran. → Location Tran. List  
**URL:** `prgId=C000033`, `menuSeq=MENUTREE_000033`  
**Bluearm target:** `/app/inventory/stock-movements`  
**Audit status:** cataloged

## Left menu under Inv. Mov. (L1)

| Section | Programs |
|---------|----------|
| **Location Tran.** | List, New, Status |
| Internal Use | List, New, Status |
| Product Defect | List, New, Status, Disassemble Status, Disposal Status, Defect Rate Status |
| Inv. Adj. | Adj. Process Status, Inv. Count List, Inventory Adj. List, Count Status, Adjustment Status |

## L2 status filter pills

All · e-Approval · Unconfirmed · Confirm

## Extra L2 filter pills

| Pill group | Values |
|------------|--------|
| Source | All · Web (ERP) · Data Uploader · Others |
| Delete flag | All · Undeleted · Delete |

## Option filter (Default)

Date, Location (in/out with sub-groups), Item (type filters), Project, PIC, Remark, Last Modifier, Send Status, Template

## Toolbar

New (F2), Email, Change Status, Send, Print, Barcode (Item), e-Approval, Delete Selected, Excel, View History

## Tab pill checklist

- [x] L0 Inv. Mov. module tab
- [x] L2 status pills
- [x] L2 source / delete pills
- [x] L2 Option Default
- [ ] New Location Tran. form tabs
- [ ] Internal Use / Product Defect / Inv. Adj. screens

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Internal Use subtree | Stock issue / consumption |
| Product Defect + disassemble/disposal | QC defect workflow |
| Inv. Count + Adjustment lists | Cycle count module |
