# E040205 — New Sales (Sales Invoice I)

**Menu path:** Inv. I → Sales → **New Sales**  
**URL:** `prgId=E040205`, `menuSeq=MENUTREE_000490`, `groupSeq=MENUTREE_000030`  
**Bluearm target:** `/app/selling/sales/new`  
**Audit status:** pass 4 — live crawl Jul 7 2026

## L2 form tab pills (top of workspace)

| Pill | Notes |
|------|-------|
| **Sales Invoice I** | Active template tab |
| **New Sales** | Template selector dropdown |

Header bar also shows **Apply** / **Delete** links for multi-slip editing when applicable.

## Header fields (Sales Invoice I)

| Field | Bluearm equivalent |
|-------|-------------------|
| Date | `invoice_date` |
| Due Date | `due_date` |
| Customer | `partner_id` |
| PIC | `pic_user_id` |
| Location-Out | `location_id` |
| Transaction Type | VAT mode (Vat Included) |
| Terms of Payment | payment terms preset |
| Currency | Domestic / foreign |
| Payment Terms | `terms_of_payment` |
| Notes | `notes` |
| SI/DR No. (Tracking No.) | customer tracking ref |
| Sales Order No. | linked SO reference |
| Attachment | file upload |
| Project | `project_id` |

## Line grid toolbar

Find (F3), Sort, View Trans.(Sales), My Item, **BOM**, **Sales Order**, **Purchases**, **Hold**, Discount, View Inv. Qty

## Row context actions (line menu)

Change Price, Adjust, Expenses, **Create Manufacture Slip**, **Create Shipping Order**

## L3 accounting block (Sales Invoice I tab / Link with Accounting Vouchers)

Toggled via footer **Link with Accounting Vouchers**. If a Sales Invoice accounting block already exists, a **Notice** asks: *"There is already a Sales Invoice. Would you like to delete it and proceed with Link with Accounting Vouchers?"* — **Confirm** / **Cancel**.

Linked accounting form uses program **E010301** (Sales Invoice I — accounting side). Fields observed:

| Section | Fields |
|---------|--------|
| Voucher Date | Accounting voucher date + slip no. suffix |
| Linked Slip | Back-reference to inventory sales slip |
| Tax Type | VAT; Paper (Tax) Invoice; Previous Approval No.; Not a Scheduled Omission; Approval No.; General; Original Tax Invoice No.; Pre.Omit; Preliminary; Electronic Type (General / Not Electronic) |
| Amounts | Customer, Pretax Amount, Tax |
| Details | Details, Remark |
| Accounts | Sales Account, Deposit Account |
| Receivable | Receivable No., Due Date |
| Mgmt | Mgmt, Receipt Projection, Fees |
| Attachment | ECDrive, File, MyStorage, Slip, Draft, Post, Image Storage |
| Other | Accounting Slip No., Dept., Project, Withholding |

## Modify Sales (edit from Sales List)

Open existing slip: Sales List → click **Date-No.** link (`<a class="text-primary-inverse">` — e.g. `07/07/2026 -4`). Opens **Modify Sales** modal (not full-page navigation).

### Edit vs New toolbar differences

| Control | New Sales (E040205) | Modify Sales (from list) |
|---------|---------------------|--------------------------|
| Hold / BOM | Yes | **No** — replaced by Loaded Slip, Barcode, Slip Barcode |
| Line tools | My Item, Sales Order, Purchases | + Verification, Calculate Profit, Load Slip, VAT Calculation by Slip, Delete Selected, Inventory, F4, Qty±, Price tools |
| Footer | Reset, List, ECOUNT Web Uploader | **Copy**, **Return**, **Previous**, **Next**, Close |
| Auto-save | — | Temp save banner (e.g. *9:31 AM has been temporarily saved.*) |

### Cash In on populated sale (pass 4)

Pre-fills from open slip:

| Field | Sample value |
|-------|--------------|
| Customer | `12756` — MOTOR ACE PHILIPPINES, INC. |
| Amount | `34,850.00` (invoice total) |
| Fees | `0.00` |
| Also present | Dept., Project, Withholding (`0`) |

### Link with Accounting Vouchers on populated sale (pass 4)

Opens **modal** (not inline confirm on existing posted slip):

| Column | Sample |
|--------|--------|
| Account Voucher | `2026/07/07-4` |
| Tax Invoice | `2026/07/07-4` |
| Item / Qty / amounts | Item 4964 LENOVO, qty 1, serial **PF5HD91T** |
| Footer | Save (F8), Close |

## Footer actions (New Sales)

Save (F8), Save/Print (F7), **Link with Accounting Vouchers**, Reset, **Cash In**, List, ECOUNT Web Uploader

### Hold modal (toolbar — opens on empty form)

| Item | Detail |
|------|--------|
| Title | **Hold List** |
| Help text | A maximum of **5** held slips can be saved; automatically deleted when used |
| Grid columns | Hold No., Customer, Item, Amount, Type, Location |
| Empty state | No data has been registered. |
| Actions | **Delete Selected**, **Close** |

Does **not** require line selection to open the list picker (contrast with pass 2 assumption).

### Cash In modal (footer — opens on empty form)

| Item | Detail |
|------|--------|
| Title | **Cash In - From Customer** |
| Header | Voucher Date |
| Fields | Deposit Account, Customer, Amount, Fees, Remark, Accounting Slip No., Attachment |
| Toolbar | Option, Help |
| Footer | Save/New, Save/Print (F7), Reset, **Close** |

Inline receipt journal entry from the sales form without saving the sales slip first.

## Parity vs E040303 (New Purchases)

| Area | Purchases | Sales |
|------|-----------|-------|
| Location | Location-In | Location-Out |
| Linked doc | PO Number | Sales Order No. |
| Line pull | Load Slip, PO | Sales Order, Hold, BOM |
| Extra line tools | Create QC Insp. Request | Create Mfg Slip, Create Shipping Order |
| Cash action | (Payment on save) | **Cash In** modal |
| Accounting | Inline L3 visible on F2 quick entry | L3 tab + Link with Accounting Vouchers toggle |

## Tab pill checklist

- [x] L2 Sales Invoice I pill
- [x] L2 New Sales dropdown
- [x] Header + line toolbar (pass 2)
- [x] Row context actions
- [x] L3 accounting sections cataloged (structure)
- [x] Hold modal (pass 3)
- [x] Cash In modal (pass 3)
- [x] Link with Accounting Vouchers — confirm dialog + E010301 field map (pass 3)
- [ ] Sales Invoice II / III variants
- [x] Cash In modal with populated totals (pass 4 — via Modify Sales)
- [x] Link with Accounting Vouchers grid modal on posted slip (pass 4)
- [ ] Hold save flow (Hold absent on Modify Sales — new form only)
- [ ] Option panel pills on form

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Sales list status pills | **Done** — migration 128 |
| Hold on lines (5-slot list) | No hold/reservation UX |
| Create Shipping Order from line | Shipping module partial |
| Cash In on save | Receipt vouchers separate |
| Link with Accounting Vouchers | GL posting panel on sales save |
| BOM line pull | Bundle/BOM explosion |
