# E010213 — Auto Generate Voucher List

**Menu path:** Acct. I → **Fast Entry** → Auto Generate Voucher List  
**URL:** `prgId=E010213`, `menuSeq=MENUTREE_001940`, `groupSeq=MENUTREE_000010`  
**Bluearm target:** `/app/finance/auto-vouchers` — inventory slip → GL auto-post queue  
**Audit status:** pass 1 — live crawl Jul 7 2026 (BLUEARM COMPUTER STORE tenant)

## Screen type

Read-only **list** of auto-generated accounting vouchers from inventory/finance slips (not an entry form).

## Status tab pills (L2)

| Pill | Default | Notes |
|------|---------|-------|
| **All** | Yes | Only tab pill observed in this tenant (no Confirm/Unconfirmed split) |

Unlike Sales/Purchase transactional lists, this screen uses a **single All pill** — no e-Approval / Confirm workflow pills on the list header.

## Toolbar / filters

| Control | Notes |
|---------|-------|
| Date range | Displayed in grid toolbar, e.g. `01/01/2026 ~ 07/07/2026` |
| Option | Settings gear (not expanded in pass 1) |

## List columns

| Column | Notes |
|--------|-------|
| Date-No. | Composite date + voucher number |
| Total | Voucher total amount |
| Remark | Header remark |
| Print | Print action per row |

## Empty state

`No data has been registered.` — tenant has no auto-generated vouchers in the YTD date window at crawl time.

## Tab pill checklist

- [x] L1 Auto Generate Voucher List menu entry
- [x] All status pill (single pill)
- [x] Date range filter display
- [x] Grid columns
- [ ] Option panel filter pills
- [ ] Row drill-down to source inventory slip
- [ ] Print preview modal

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Auto-post queue from inventory slips | Inventory → GL auto-post TBD |
| Voucher list with print | Journal list partial |
| Saved date-range inquiry | — |

## Notes

- Part of Fast Entry left menu alongside the four manual journal forms; bridges **Inv. I** transactional slips to **Acct. I** GL vouchers.
- Hash reload (`prgId=E010213`) loads faster than sequential left-menu navigation from another journal form.
