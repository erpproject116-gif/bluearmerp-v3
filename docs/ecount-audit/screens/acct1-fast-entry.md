# Acct. I — Fast Entry

**Module path:** Acct. I → **Fast Entry**  
**Default screen:** General Journal form (`prgId=E010201` via hub `C000010`)  
**Bluearm target:** `/app/finance/journal`, `/app/finance/cash`  
**Audit status:** pass 5 — live crawl Jul 7 2026

## L0 module tabs (Acct. I bar)

Setup, **Fast Entry**, Invoice, Bank Acct./Card, Cash, Non-Cash Transaction, Notes, Fixed Assets, Accounting Transaction Mgmt, Reports.

## Left menu (Fast Entry subtree)

| Program | prgId | Bluearm equivalent |
|---------|-------|-------------------|
| **General Journal** | E010201 | Manual journal entry — **live crawled** |
| Payment Journal | E010408 | Payment vouchers / AP cash out |
| Receipt Journal | E010403 | Official receipts / AR cash in |
| S/A Journal | E010505 | Sales & acquisition journal — **live crawled** |
| Bank Reconciliation | E010208 | Bank reconciliation — **live crawled** |
| Auto Generate Voucher List | E010213 | Auto-posting from inventory slips — **live crawled** |
| New Balance Adjustment | E010209 | Opening balance adjustment — **live crawled** |
| Bal. Count List | E010211 | Balance count docs — **live crawled** |
| Balance Adjustment List | E010210 | Posted adjustments — **live crawled** |
| Bal. Adjustment Status | E010212 | Book vs actual status — **live crawled** |

**Hub prgId:** `C000010` — Fast Entry tab default; opens General Journal inline.

See form detail: `screens/E010201-general-journal.md`.

## S/A Journal form summary (E010505)

- Header: Voucher Date, Type, Accounting Slip No., Comment Details, Attachment
- Grid: **Employee Code/Name** + Account + Customer/Vendor + Amount/Fees + Remark + Additional Info (Enter)
- Toolbar: Find (F3), **Hold** only (no Projection / Bank / Card / Payment Agency)
- Footer: Save (F8), Save/Print (F7), Reset, List — **no ECOUNT Web Uploader** in this tenant
- See `screens/E010505-sa-journal.md`

## Bank Reconciliation summary (E010208)

- List screen with date/bank-account filters; columns for bank vs ERP balances + report links
- Toolbar: Search (F3), New (F2), Delete Selected
- **New Bank Reconciliation** modal: Date, Slip Start Date, Bank Account, balance summary (Receipt/Payment/Difference), match pills (All/Unchecked/Check/Exclude), transaction grid, Save (F8), Receipts Journal shortcut
- See `screens/E010208-bank-reconciliation.md`

## Auto Generate Voucher List summary (E010213)

- List screen (not entry form) for auto-posted vouchers from inventory slips
- Status pill: **All** only (single pill)
- Columns: Date-No., Total, Remark, Print
- Date range filter in toolbar; empty state when no auto-vouchers
- See `screens/E010213-auto-generate-voucher-list.md`

## Balance adjustment subtree (E010209–E010212)

- **New Balance Adjustment** — single-date GL grid with Dr/Cr balances, **Adjust** per row; account category pills (Assets/Liabilities/Equity/I/S/Cost1-3/None)
- **Bal. Count List** — count documents; Option pills include Delete Type (All/Undeleted/Delete) and Type (by Account Code / By Customer/Vendor)
- **Balance Adjustment List** — posted slips: Bal. Adjustment No., Book Values, Actual Price
- **Bal. Adjustment Status** — range report with Compare with Actual Balance, View as Graph
- See `screens/acct1-balance-adjustment.md`

## General Journal form summary (E010201)

- Header: Voucher Date, Type, Accounting Slip No., Comment Details, Attachment
- Grid: Dr/Cr lines with Account, Customer/Vendor, amounts, Remark, Additional Info (Enter)
- Toolbar: Find (F3), Load Slip, Save (F8), Save/Print (F7), Reset, List, ECOUNT Web Uploader
- Option gear: Input Screen Settings, My Code/Text Settings, Function Setup (not tab pills)
- Notification block: Target + Email/Messenger/Msg/Push

## Related Acct. I L0 tabs (same module bar)

| L0 tab | Programs (summary) |
|--------|-------------------|
| Setup | Chart of Accounts, Merchant Account, Foreign Currency, PIC |
| Invoice | Sales Invoice I, Purchase Invoice I (accounting-side) |
| Bank Acct./Card | PG Sales List |
| Cash | Cash In/Out subtrees (Receipt/Payment journals) |
| Non-Cash Transaction | Non-cash entries |
| Notes | Promissory notes |
| Fixed Assets | Asset register, increase/decrease |
| Accounting Transaction Mgmt | Voucher lists + invoice status |
| Reports | See `C000001-acct-reports-hub.md` |

## Book → Journal (Reports hub)

**Journal** under Acct. I Reports → Book is a **report/book view**, distinct from Fast Entry → General Journal **entry form**.

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| General / Payment / Receipt / S/A journals as separate entry UIs | Partial — vouchers exist but not 4-way split |
| Auto Generate Voucher List | Inventory → GL auto-post TBD |
| Bank Reconciliation | Banking module partial |
| Balance adjustment workflow (E010209–212) | Period close TBD — see `acct1-balance-adjustment.md` |
| Load Slip on General Journal | Inventory slip → journal TBD |

## Tab pill checklist

- [x] L0 Fast Entry module tab
- [x] General Journal form fields (E010201 pass 1)
- [x] Payment Journal form (E010408 pass 1)
- [x] Receipt Journal form (E010403 pass 1)
- [x] S/A Journal form (E010505 pass 1)
- [x] Auto Generate Voucher List (E010213 pass 1 — single All pill)
- [x] Option gear settings menu
- [ ] Additional Info modal (Enter link on journal lines)
- [x] Bank Reconciliation list + New modal (E010208 pass 1)
- [x] Balance adjustment subtree (E010209–E010212 pass 1)
