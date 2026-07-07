# E040303 — New Purchases (Purchase Invoice I)

**Menu path:** Inv. I → Purchases → **New Purchases**  
**URL:** `prgId=E040303`, `menuSeq=MENUTREE_000510`  
**Bluearm target:** `/app/finance/supplier-invoices/new` + GR Load Slip flow  
**Audit status:** form tab pills documented (pass 5–8 — Load Slip slip-type + PO line picker)

## L2 form tab pills (top of workspace)

| Pill | Notes |
|------|-------|
| **Purchase Invoice I** | Active template tab (tenant may have II/III variants via New Purchase dropdown) |
| **New Purchase** | Dropdown — alternate purchase entry templates |

## Header fields (Purchase Invoice I)

| Field | Bluearm equivalent |
|-------|-------------------|
| Date | `invoice_date` |
| Customer (vendor) | `partner_id` |
| PIC | `pic_user_id` / creator |
| Location-In | `location_id` on GR lines |
| Transaction Type | VAT mode |
| Currency | `currency_id` |
| Notes | `notes` |
| Attachment | supplier invoice attachments |
| SI/DR No. (Tracking No.) | `vendor_invoice_no` |
| PO Number | linked PO reference |
| PAYMENT TERMS | `terms_of_payment` |
| Project | `project_id` |

## Line grid toolbar

Find (F3), Sort, View Trans.(Purchases), My Item, **Purchase Order**, Sales Order, Discount, **Load Slip**, View Inv. Qty

**Load Slip** = ECount term for pulling open source-document lines into purchase — Bluearm `OpenGRLinePickerModal`.

### Load Slip modal (pass 5)

Clicking **Load Slip** opens a slip-type picker (same family as **View Trans.(Purchases)**):

| Type | Menu |
|------|------|
| Sales | Quotation · Sales Order · Sales · Shipping Order · Shipping |
| Purchases | Purchase Request · Purchase Plan · RFQ · **Purchase Order** |
| Production | Job Order · Goods Issued · Goods Receipt |
| Inv. Mov. | Location Tran. · Internal Use · Product Defect |
| After-Sales | Repair Order · Repair |
| Quality Control | Quality Inspection Request · Quality Inspection |
| Export | Invoice / Packing List |
| Warehouse Mgmt | Scheduled Receipt · Scheduled Release · New (Increase) · New (Decrease) |

After selecting a slip type, ECount opens the line-picker for that document. **Load Slip → Purchase Order** may require vendor/customer on the header first; the toolbar **Purchase Order** button opens the PO picker without a header vendor (all vendors in scope).

### Purchase Order line-picker modal (pass 8)

Opened via toolbar **Purchase Order** or **Load Slip → Purchase Order** (after vendor set).

| Control | Notes |
|---------|-------|
| **Default** | Option filter pill |
| Date | Range; default **Recent 30 Days (+1 Month)** (~Jun–Aug 2026) |
| PO No. | Document number filter |
| Domestic/Foreign | All / Domestic / Foreign |
| Location | Include Sub-groups |
| Project | Project picker |
| Vendor | Include Sub-groups |
| Item | Category sub-filters (All / Raw Material / Sub Material / Finished Goods / …) |
| Type | **by Line** (view mode) |

**Modal toolbar:** Apply Residual Qty (F8) · Excel · Close · View History

**Grid columns (by Line):** Row # · Date-No. · PO No. · Vendor · Transaction Type · Item Name (summary) · Date · Amount · Status (e.g. Finished) · View · Print · PIC · PIC for Customer/Vendor · Remark · Location

**Tenant note:** Populated with **Finished** PO lines from Jul 2026 (e.g. HYW IT Distributor POs). Apply Residual Qty fills open qty onto the purchase invoice line grid.

## Line columns

Item Code, Item Name, QTY, Non-Vat, Total Non-Vat, Tax, Vat-Inc.

## Row context actions (line menu)

Change Price, Adjust, Expenses, Create Quality Insp. Request

## L3 accounting / posting pills (lower form sections)

Visible sections when form expanded (tab-pill protocol L3):

| Section | Fields |
|---------|--------|
| Voucher Date | Accounting voucher date |
| Tax Type | VAT Inc. 12%, Paper invoice, BIR approval refs, Preliminary/General, electronic flags |
| Customer / amounts | Pretax Amount, Tax, Remark |
| Accounts | Account for Purchase, Withdrawal Account, Payable No., Due Date, Mgmt Payment Projection, Fees |
| Attachment | ECDrive, MyStorage, Slip Draft, Post Image |
| Notification | Target, Method (Email/Messenger/Msg/Push) |
| Details Settings | Template field visibility |

## Footer actions

Save (F8), Save/Print (F7), Reset, Cash Payment, List, ECOUNT Web Uploader

## Tab pill checklist

- [x] L2 Purchase Invoice I pill
- [x] L2 New Purchase dropdown (single variant seen: Purchase Invoice I)
- [x] L3 accounting blocks cataloged from snapshot
- [ ] Purchase Invoice II / III variants (if tenant has them)
- [ ] Option panel pills on form
- [x] Load Slip slip-type picker modal (pass 5)
- [x] Purchase Order line-picker grid + Apply Residual Qty (pass 8)
- [ ] Cash Payment modal tabs

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Purchase Invoice I/II/III templates | Single supplier invoice form |
| Cash Payment on save | Payment vouchers separate |
| Line Adjust / Expenses | — |
| QC Insp. Request from line | Quality module partial |
| BIR tax invoice fields | PH tax fields on purchase invoice panel |
| PO line picker + Apply Residual Qty | OpenGRLinePickerModal — PO path crawled pass 8 |
