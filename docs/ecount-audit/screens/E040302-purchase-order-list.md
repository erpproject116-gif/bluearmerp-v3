# E040302 — Purchase Order List

**Menu path:** Inv. I → Purchases → Purchase Order → **Purchase Order List**  
**URL:** `prgId=E040302`, `menuSeq=MENUTREE_000509`  
**Bluearm target:** `/app/purchase-order/purchase-orders`  
**Audit status:** pass Jul 28 2026 — read-only

## Status pills

All · e-Approval · Unconfirmed · Confirm · In Progress (Completed may be template-dependent).

## Toolbar

New (F2), Email, Change Status, Send, Print, Barcode (Item), Generate Other Slips, e-Approval, Delete Selected.

## Grid columns

Date-No., Purchase Order No, Vendor, Transaction Type, Item Name [Spec Name], Delivery Date, Total, Progress Status, Created Slip, Print, Initial Creator, PIC Name, Delivery Remarks, Customer Name, Voucher Status.

## Bluearm parity notes

- Uses `DOC_PROGRESS_STATUS_TABS`; Jul 28 tabs updated to All / e-Approval / Unconfirmed / In Progress / Completed (dropped Confirm-as-completed label quirk).
