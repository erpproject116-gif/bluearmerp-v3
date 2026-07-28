# E040202 — Quotation List

**Menu path:** Inv. I → Sales → Quotation → **Quotation List**  
**URL:** `prgId=E040202`, `menuSeq=MENUTREE_000487`  
**Bluearm target:** `/app/quotation/quotations`  
**Audit status:** pass Jul 28 2026 — read-only (BLUEARM COMPUTER STORE)

## Status pills (L2)

| Pill | Notes |
|------|-------|
| All | Default |
| Unconfirmed | Clicked |
| Completed | Clicked |
| e-Approval / Confirm / In Progress | Present in Option / related filters |

List template slots **1–10** present (tenant templates).

## Toolbar (non-destructive)

Search(F3), Option, Help, New(F2), Email, Change Status, Send, Print, Barcode (Item), Generate Other Slips, e-Approval, Delete Selected, Excel.

## Grid columns (observed)

Date-No., Transaction Type Name, Reference No., Customer Name, Item Name (Summary), Quotation Validity, Total Quotation Amount, Progress Status, Voucher Status, Created Slip, Creator, Print.

## Bluearm parity notes

- List + progress filter + Generate Other Slips exist.
- Jul 28: added `e_approval` to list status options (was missing vs Ecount pills).
- Remaining gaps: tenant list templates 1–10, Option search parity, e-Approval workflow depth.
