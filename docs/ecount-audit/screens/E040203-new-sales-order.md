# E040203 — New Sales Order

**Menu path:** Inv. I → Sales → Sales Order → **New Sales Order**  
**URL:** `prgId=E040203`, `menuSeq=MENUTREE_000488`, `groupSeq=MENUTREE_000185`  
**Bluearm target:** `/app/selling/sales-orders/new`  
**Audit status:** pass 1 — live crawl Jul 7 2026

## Form title

**Nes Sales Order** (tenant UI spelling) / New Sales Order

## Header fields

| Field | Notes |
|-------|-------|
| Date | Order date |
| Due Date | |
| Customer | Lookup |
| PIC | |
| Location-Out | Ship-from location |
| Transaction Type | Vat Included |
| Currency | Domestic |
| Reference | |
| Notes | |
| Delivery Remarks | |
| Payment Terms | MOP default |
| Attachment | |
| Sales Order No. | Auto/manual numbering |
| Project | |

## Line grid toolbar

Find (F3), Sort, **View Trans.(Sales Order)**, **My Item**, **Quotation**, Discount, View Inv. Qty, Created Slip, Barcode

## Line columns

| Column | Notes |
|--------|-------|
| Item Code / Item Name / Spec. | |
| Qty | |
| Non-Vat / Non-Vat Total | |
| Vat-Inc. / Tax | |
| Remarks | |

## Actions

Save (F8), Save/Print (F7), Reset, **List** (back to SO list), ECOUNT Web Uploader

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Pull from Quotation | SO from quotation picker |
| View Trans.(Sales Order) | SO line history |
| VAT line split (Non-Vat / Vat-Inc.) | Tax line model on SO |

## Tab pill checklist

- [x] Header + line grid + toolbar
- [ ] Option panel / form template pills
- [ ] Link to New Sales `E040205` pull (Sales Order toolbar on invoice)
