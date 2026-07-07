# E010208 — Bank Reconciliation

**Menu path:** Acct. I → **Fast Entry** → Bank Reconciliation  
**URL:** `prgId=E010208`, `menuSeq=MENUTREE_001389`, `groupSeq=MENUTREE_000010`, `menuType=MENUTREE_000001`  
**Bluearm target:** `/app/finance/acct-i/bank-reconciliation`, `/app/finance/banking`  
**Audit status:** pass 1 — live crawl Jul 7 2026 (BLUEARM COMPUTER STORE tenant)

## Screen type

**List** of bank reconciliation sessions (not a single ongoing form). **New (F2)** opens an inline modal to create/match a reconciliation.

**Load note:** Content pane may stay empty 15–25s after hash navigation; use left-menu click or full URL with `menuSeq=MENUTREE_001389`.

## List toolbar

| Control | Notes |
|---------|-------|
| Search (F3) | Filter list |
| Option | Saved filter template (see pills below) |
| Help | Context help |
| New (F2) | Opens **New Bank Reconciliation** modal |
| Delete Selected | Bulk delete checked rows |

## List filter pills (Option template)

| Pill / filter | Notes |
|---------------|-------|
| **기본** (Default) | Saved filter template name in tenant |
| Last Used Date | Date range (e.g. 06/01/2026 ~ 07/07/2026) |
| Bank Account | Select — filter by registered bank account |
| Sort by Modified Date | Sort order under Others |

No All/e-Approval style status pills on the list itself.

## List columns

| Column | Bluearm equivalent |
|--------|-------------------|
| Date-No | Reconciliation session id |
| Bank Account Name | Bank account display name |
| Bank Account | Account code/number |
| Bank Beginning Balance | Opening bank balance |
| Finalized Balance | Confirmed bank balance |
| Bank Account Balance | Current bank statement balance |
| Final Balance | Ending reconciled balance |
| ERP Book Balance | GL/cash book balance |
| Report (Summary) | Summary reconciliation report link |
| Report (Details) | Detail reconciliation report link |

**Empty state:** No data has been registered.

## New Bank Reconciliation modal (F2)

| Section | Fields |
|---------|--------|
| Header | **Date**, **Slip Start Date**, **Bank Account** |
| Balance summary | ERP Book Balance, Bank Beginning Balance, Bank Account Balance, (+) Total Receipt, (=) Finalized Balance, (-) Total Payment, **Difference** |
| Match filters | **All**, **Unchecked**, **Check**, **Exclude** (line match status pills) |
| Transaction grid | Date-No., Customer, Check No., Receivable/Payable No., Receipt, Withdrawal, Remark, History |
| Grid actions | Check, Exclude Selected |
| Footer | **Save (F8)**, **Receipts Journal**, **Close** |

Grid empty in tenant: *No data has been registered.*

## Parity vs Bluearm

| ECount | Bluearm |
|--------|---------|
| List of reconciliation sessions per bank account | Bank reconciliation list exists at `/app/finance/acct-i/bank-reconciliation` |
| Match receipts/withdrawals to bank lines | Mark cleared / match workflow TBD |
| Difference calculation panel | Needs ERP book vs bank side-by-side |
| Receipts Journal shortcut from modal | Link to receipt journal entry |

## Tab pill checklist

- [x] List filter template pill (Default/기본)
- [x] List columns + toolbar
- [x] New modal header + balance summary
- [x] Match status pills (All / Unchecked / Check / Exclude)
- [ ] Open existing reconciliation (needs seeded bank data)
- [ ] Report (Summary) / Report (Details) output
- [ ] Option gear settings menu

## Related programs

- **Reg. Bank Account** — Acct. I → Setup (prerequisite master)
- **Receipt Journal** (E010403) — linked from New modal footer
- **Bank Account Transactions** — on Payment/Receipt journal toolbars
