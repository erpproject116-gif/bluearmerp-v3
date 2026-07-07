# Acct. II — breadth pass 1

**Module:** Acct. II horizontal tabs  
**Audit status:** pass 4 — live crawl Jul 7 2026 (AR/AP payment journal modals)  
**Bluearm target:** AR/AP aging, billing notes, budget — partial coverage today

## Acct. II L0 tabs (header)

Receivable Management · Billing Note · Payable Management · Check Management · Budget · **Exps.** (Expenses) · Contract · e-Contract · Withholding

| L0 tab | Default prgId | Default screen (observed) |
|--------|---------------|---------------------------|
| Receivable Management | `C000125` | New Receivable Payment list |
| Billing Note | `C001256` | (not expanded) |
| Payable Management | `C000126` | New Payable Payment list |
| Check Management | `C000127` | (not expanded) |
| Budget | `C000021` | Budget Status |
| Exps. / Expenses | `C000005` | Import Tracking No. (Trade Voucher List) |
| Contract | `C000666` | (not expanded) |
| e-Contract | `C061101` | (not expanded) |
| Withholding | `C001258` | (not expanded) |

---

## Receivable Management (`C000125`)

### Left sub-menu

Receivable List · **New Receivable Payment** · Receivable Transaction Details · Registered Receivable Status · Receivable Payment Status · Receivable Status · Customer/Vendor AR Book · Customer/Vendor AR Summary Book · Customer/Vendor AR Book Print · AR Aging Details

### New Receivable Payment — list (default landing)

| Column | Notes |
|--------|-------|
| Receivable No. | e.g. `BAS SI 2764 DR 4690` |
| Occurrence Date | |
| Due Date | |
| Receivable Account Name | e.g. Accounts Receivable |
| Customer/Vendor Code / Name | |
| Balance | |
| Balance Exchange Rate / Foreign Currency Balance | |
| Discount Amount / Decrease Amount | |
| Remark | Line item description in sub-row |
| Dept. Name / Project Name | |

**Toolbar:** Search (F3), Option, Help, pagination

Tenant has **populated AR rows** (multi-page).

---

## Payable Management (`C000126`)

### Left sub-menu

Payable List · **New Payable Payment** · Payable Transaction Details · Registered Payable Status · Payable Payment Status · Payable Status · Customer/Vendor AP Book · Customer/Vendor AP Summary Book · Print Customer/Vendor AP Summary Book · AP Aging Details

### New Payable Payment — list (default landing)

Same column pattern as receivable (Payable No., Occurrence/Due Date, AP account, vendor, balance, FX, remark).

Tenant has **populated AP rows** (4+ pages).

---

## Budget (`C000021`)

### Left sub-menu

Monthly Budget List · Reports · **Budget Status** · Budget vs. Actual · Budget Control Book · Budget-Actual Book · Controlled Budget vs. Actual

### Budget Status — inquiry

**L2 filter pills:** Default · All

| Filter section | Fields |
|----------------|--------|
| Display Method | Summary · Dept. · Project (radio groups) |
| Display Method (time) | Summary · Monthly |
| Date | Range (default 01/2026 ~ 12/2026) |
| Dept. / Project / Account | Lookups |
| Others | Display Apvl. Line |
| Unit | 1,000 |

**Date quick buttons:** This Month (~ Today), Prev. Month, Current Year, Current Period, Prev. Period, Settings, Reset — **Search (F8)**

---

## Expenses (`C000005`) — Exps. tab

### Left sub-menu (Import / trade expenses subtree)

Import Tracking No. · Expenses Type · Register Expenses · Purchase Invoice · Import Expenses · Log Misc. Expenses · Register Payments (To Vendor · To Customs Broker) · Customs Clearance · Update Account · Trade Voucher List · Reports (Import Status · Fund Statement · Trade Voucher List)

### Trade Voucher List — list (default on Exps. tab in pass 1)

**L2 status pills:** All · e-Approval · Unconfirmed · Confirm

| Column | Notes |
|--------|-------|
| Voucher No. | |
| Transaction Type | |
| Amount | |
| Customer/Vendor | |
| Remarks | |
| Print | |

**Toolbar:** Search (F3), Option, Help, Print, Delete Selected, Excel

**Empty state:** `No data has been registered.`

---

### New Receivable Payment (`E060402`) — AR payment workflow

Not a blank voucher form. **Select open receivable rows** on the list → enter **Decrease Amount** per row → post via **Receipts Journal** modal.

| List column | Notes |
|-------------|-------|
| Receivable No. | Open AR document |
| Occurrence Date / Due Date | |
| Receivable Account Name | e.g. Accounts Receivable |
| Customer/Vendor Code / Name | |
| Balance / FX columns | |
| Discount Amount | |
| **Decrease Amount** | Editable when row selected — payment amount |
| Remark / Dept. / Project | |

**Receipts Journal modal** (after row selection):

| Field | Options |
|-------|---------|
| Received Type | Cash / Deposit · Note · Check · Other Account |
| Deposit Account | |
| Remark | Same as Remark toggle |
| Receivable No. | Set Manually |
| Batch Import Bundling | by Line · By Customer/Vendor / by Account Code |

**Actions:** Apply (F8), Close

Tenant has **populated AR rows** (multi-page).

**Related (Site Map):** `E060403` Receivable List · `E060407` Receivable Payment Status · `E060408` AR Aging Details

### New Payable Payment (`E060502`) — AP payment workflow

Same pattern as receivable: select payable rows → **Decrease Amount** → **Payments Journal** modal.

**Payments Journal modal:**

| Field | Options |
|-------|---------|
| Payment Type | Cash / Deposit · Note · Check · Other Account |
| Withdrawal Account | |
| Remark | Same as Remark toggle |
| Payable No. | Set Manually |
| Batch Import Bundling | by Line · By Customer/Vendor / by Account Code |

**Actions:** Apply (F8), Close

Tenant has **populated AP rows** (multi-page).

**Related (Site Map):** `E060503` Payable List · `E060507` Payable Payment Status · `E060508` AP Aging Details

---

## Billing Note (`C001256`)

### Left sub-menu

Billing Note List · Billing Note Status

### Billing Note List — list (default landing)

**L2 status pills:** All · Unconfirmed · Confirm

| Column | Notes |
|--------|-------|
| Slip Date-No. | |
| Customer/Vendor Name | |
| Billing Note No. | |
| Payment Date | |
| Total Amount | |
| Print | |

**Toolbar:** Search (F3), Option, Help, New (F2), Email, Send, Print, Delete Selected, Excel

**Empty state:** `No data has been registered.`

### Billing Note Enter — new form (F2 child modal)

| Header | Notes |
|--------|-------|
| Date | Slip date |
| Customer | Lookup |
| Dept. / Project | |
| Payment Date | |
| Billing Note No. | |

**Line toolbar:** Find (F3), Sort, **Sales** (pull AR lines)

| Line column | Notes |
|-------------|-------|
| Tax Type | VAT default |
| Receivable No. | Link to AR |
| Sales Invoice Date / Due Date | |
| Pretax Amount / Tax / Amount | |
| Withholding / Payment Amount | |
| Remark | |

**Actions:** Save (F8), **Save/Print (F7)**, Reset, Close

**List prgId (Site Map):** `E061201` Billing Note List · `E061203` Billing Note Status

---

## Check Management (`C000127`)

### Left sub-menu

**Received Check:** New RCVD. Check Payment · Checks Received List · Received Check Transactions · Checks Received Status · Checks Received Status Report · Decrease of Received Checks Balance

**Issued Check:** New Issued Check Clearance · Checks Issued List · Issued Check Transactions · Checks Issued Status · Increase/Decrease of Issued Checks Balance

### Checks Received List — list (default landing)

**L2 status pills:** All

| Column | Notes |
|--------|-------|
| Date | |
| Check No. | |
| In./De. Type | Increase/decrease type |
| Customer/Vendor Name | |
| Amount | |
| Remark | |
| Transaction Type | |
| Invoicing Date-No. | |

**Toolbar:** Search (F3), Option, Help, New (F2), Delete Selected, Excel

**Empty state:** `No data has been registered.`

---

## Contract (`C000666`)

### Left sub-menu

Contract Item · Contract · New Contract · Contract List · Change Contract Price/Qty-Batch · Contract Status · Estimated Invoice (Create/Print/Outstanding Status) · Invoicing · Collective apply to Acct./Sales · Pre-Invoicing Status · Sales Invoice Status (Contract) · **Contract Field List**

### Contract Field List — list (default landing in pass 2)

| Column | Notes |
|--------|-------|
| Contract Field Code | |
| Contract Field Name | |
| Invoicing Cycle | |
| Price / Price by Item / Price by Quantity | |
| Usage Status | |

**Toolbar:** Search (F3), Option, Help, New (F2), Deactive/Reactivate, Excel

**Empty state:** `No data has been registered.`

---

## Withholding (`C001258`)

### Left sub-menu

Tax Withholding Type · Reg. Withholding Tax Type · **Withholding Tax on Purchase** (List · New · Status) · **Withholding Tax on Sales** (List · New · Status)

### Withholding Tax on Sales List — list (default landing)

**L2 status pills:** All

| Column | Notes |
|--------|-------|
| Date-No. | |
| From date / To date | Period range |
| Customer/Vendor Name | |
| Total Pretax Amount | |
| Total Withholding Tax | |
| Print | |

**Toolbar:** Search (F3), Option, Help, New (F2), Email, Send, Print, Delete Selected, Excel

**Empty state:** `No data has been registered.`

### New Withholding Tax on Sales (`E061308`) — form

| Header | Notes |
|--------|-------|
| Date | Document date |
| Customer | Lookup |
| From date / To date | Withholding period range |

**Line toolbar:** Find (F3), **Hold**

| Line column | Notes |
|-------------|-------|
| Withholding Type Code / Name | |
| 1st / 2nd / 3rd Month of the Quarter | |
| Pretax Amount | |
| Withholding Tax Rate / Withholding | |
| Remark | |

**Actions:** Save (F8), **Save/Print (F7)**, Reset

**Related (Site Map):** `E061309` WH on Sales List · `E061310` WH on Sales Status · `E061303` New WH on Purchase

---

## e-Contract (`C061101`)

### Left sub-menu

**Contract Progress** · Contract Status

### Contract Progress — list (default landing)

| Column | Notes |
|--------|-------|
| Date | |
| Contract Name | |
| Progress Status | |
| Requested Function | |
| Document | |
| Copy | |
| Type Name | |

**Toolbar:** Search (F3), Option, Help, New (F2), Delete Selected, Excel

**Empty state:** `No data has been registered.`

**Related:** `E061102` Contract Status · `E061103` Employment Contract Progress (e-Employment Contract subtree)

---

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| AR/AP payment lists + aging books | Partial — supplier/customer invoices only |
| Billing Note / Check Management | Not implemented |
| Budget Status inquiry | Not implemented |
| Import expenses / trade vouchers | Not implemented |
| Contract / e-Contract / Withholding | Not implemented |

## Tab pill checklist

- [x] Acct. II L0 tab → prgId map (9 tabs)
- [x] Receivable Management list columns + sub-menu
- [x] Payable Management list columns + sub-menu
- [x] Budget Status filter pills
- [x] Expenses Trade Voucher List status pills
- [x] Billing Note List — status pills + columns (`C001256`)
- [x] Check Management — Checks Received List (`C000127`)
- [x] Contract Field List (`C000666`)
- [x] Withholding Tax on Sales List (`C001258`)
- [x] Billing Note Enter form (F2 modal)
- [x] New Withholding Tax on Sales form (`E061308`)
- [x] e-Contract Contract Progress (`C061101`)
- [x] New Receivable Payment workflow (`E060402` + Receipts Journal modal)
- [x] New Payable Payment workflow (`E060502` + Payments Journal modal)
