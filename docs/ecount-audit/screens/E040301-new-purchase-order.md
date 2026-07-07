# E040301 — New Purchase Order

**Menu path:** Inv. I → Purchases → Purchase Order → **New Purchase Order**  
**URL:** `prgId=E040301`, `menuSeq=MENUTREE_000508`, `groupSeq=MENUTREE_000191`  
**Bluearm target:** `/app/buying/purchase-orders/new`  
**Audit status:** pass 1 — live crawl Jul 7 2026

## Header fields

| Field | Notes |
|-------|-------|
| Date | PO date |
| Vendor | Lookup |
| Customer Name | End customer ref (dropship) |
| Delivery Date | |
| PIC | |
| Location-In | Receive location |
| Transaction Type | VAT Inc. 12% |
| Currency | Domestic |
| Cc. | |
| Note / Note for PIC | |
| Delivery Remarks | |
| Sales Order No. | Linked SO |
| PAYMENT TERMS | |
| Attachment | |
| PO No. | |
| Project | |

## Line grid toolbar

Find (F3), Sort, **View Trans.(Purchase Order)**, **My Item**, **BOM**, **Sales Order**, **Purchase Plan**, **RFQ**, **Load Slip**

## Line columns

| Column | Notes |
|--------|-------|
| Item Code / Item Name | |
| Qty | |
| Non-Vat / Non-Vat Total | |
| Vat-Inc / Tax | |
| Delivery Date | Per line |

## Actions

Save (F8), Save/Print (F7), Reset, **List**, ECOUNT Web Uploader

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Load Slip / RFQ / Purchase Plan pulls | PO sourcing chain |
| Per-line Delivery Date | PO line promised date |
| BOM explosion on PO | Bundle/BOM on PO lines |

## Tab pill checklist

- [x] Header + line grid + toolbar (incl. Load Slip)
- [ ] Option panel
- [ ] Receive → New Purchases `E040303` chain
