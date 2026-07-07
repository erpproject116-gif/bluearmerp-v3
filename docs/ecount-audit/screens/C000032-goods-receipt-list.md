# C000032 — Goods Receipt List (Production default)

**Menu path:** Inv. I → **Production** (L0 module tab) → Goods Receipt → Goods Receipt List  
**URL:** `prgId=C000032`, `menuSeq=MENUTREE_000032`  
**Bluearm target:** `/app/job-costing` / production receiving  
**Audit status:** cataloged — extra filter pills documented

## L0 module tab

**Production** is the default landing when clicking the L0 tab (not BOM or Job Order).

## Left menu under Production (L1)

| Section | Programs |
|---------|----------|
| BOM | BOM Design, BOM Design Status, Estimated BOM |
| Process | Reg. Process, Reg. Resource, BOR (Required Time), Calculate Required Time |
| Planning | New Production Plan/MRP |
| Job Order | List, New, Status, Apply J/O to Job, Progress by J/O, J/O Efficiency |
| Goods Issued | List, New, Status |
| Job | New Job Record, Job Record List, Job Record Status |
| **Goods Receipt** | **List**, GR I / II / III (separate entry forms), GR Status, GR/Consumed Status I, Payment Status, Discount on O/E, A/P by Vendor |
| Invoicing (O/E) | Collective Invoicing (O/E), Purchase Invoice List, Purchase Invoice Status |

## L2 status filter pills

All · e-Approval · Unconfirmed · Confirm (same pattern as Sales/Purchases lists)

## Extra L2 filter pills (Production-specific)

Visible inside Option / list header area:

| Pill group | Values |
|------------|--------|
| GR type | All · Goods Receipt I · Goods Receipt II · Goods Receipt III |
| Source | All · Web (ERP) · Data Uploader · Others |
| Delete flag | All · Undeleted · Delete |

Toolbar also has **Goods Receipt I** quick button and **View History**.

## Option filter (Default)

Date, GR No, Location, Project, Item (with item-type sub-filters), Others (Sort, Outsourcing Factory Only), Send Status, Template

## Tab pill checklist

- [x] L0 Production module tab
- [x] L2 status pills
- [x] L2 GR-type / source / delete pills
- [x] L2 Option Default
- [ ] GR I/II/III form tabs (separate programs)
- [ ] Job Order / Goods Issued form tabs

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| GR I / II / III variants | Single GR flow — verify variant parity |
| Outsourcing factory filter | Job-costing vendor filter |
| GR/Consumed Status report | Production consumption reporting |
