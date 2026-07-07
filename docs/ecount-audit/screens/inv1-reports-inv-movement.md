# Inv. I → Reports → Inv. Movement subtree (pass 12)

**Audit date:** Jul 7 2026 (pass 12)  
**Tenant:** BLUEARM COMPUTER STORE  
**Menu path:** Inv. I → Reports → Inv. Movement  
**Bluearm target:** `/app/inventory/stock-movements/reports` (proposed)

## Authorization block (tenant)

All pass-12 targets in this subtree returned **No Authorization** with a **Request Authorization** button. Option panels and tab pills could not be audited live.

| Screen | prgId | menuSeq | Live result |
|--------|-------|---------|-------------|
| Location Tran. Status | `E040505` | MENUTREE_000549 | No Authorization |
| Internal Use Status | `E040506` | MENUTREE_000550 | No Authorization |
| Product Defect Status | `E040509` | MENUTREE_000551 | No Authorization |
| Inv. Count Status | `E040615` | MENUTREE_000555 | Not attempted (same auth profile expected) |
| Inv. Adjustment Status | `E040608` | MENUTREE_000556 | Not attempted (same auth profile expected) |

**Site Map catalog** lists these under Inv. I → Reports → Inv. Movement alongside list programs (`C000033` Location Tran. List, etc.). Re-audit when tenant grants report permissions.

## Expected pattern (from sibling status reports)

Based on Sales/Purchase/Production status reports audited in passes 5–12, Inv. Movement status reports likely share:

- **Default** Option pill (possibly **All** on some screens)
- **Details / Summary / by Line** type aggregation
- Date range with toolbar shortcuts (Today, This Month ~ Today, etc.)
- Location · Item (category sub-filters) · Project · PIC · Remark
- e-Approval status filters (All / e-Approval / Unconfirmed / Confirm)
- Display Apvl. Line · Sort/Subtotal Criteria · View as Graph
- Print · Excel

Inv. Count / Inv. Adjustment status reports may add count-sheet or adjustment-specific document filters — confirm when authorized.

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Location Tran. Status report | Stock movement list only; no dimensional status inquiry |
| Internal Use / Product Defect status | No internal consumption or defect analytics |
| Inv. Count / Adjustment status | Stock reconciliation reports partial |
| Report authorization gating | Role-based report access not modeled |

## Tab pill checklist

- [ ] E040505 — blocked No Authorization (pass 12)
- [ ] E040506 — blocked No Authorization (pass 12)
- [ ] E040509 — blocked No Authorization (pass 12)
- [ ] E040615 — catalog only; auth blocked (pass 12)
- [ ] E040608 — catalog only; auth blocked (pass 12)
