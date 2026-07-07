# C000001 — Acct. I Reports hub

**Menu path:** Acct. I → **Reports** (default landing when opening Acct. I)  
**URL:** `prgId=C000001`, `menuSeq=MENUTREE_000001`  
**Bluearm target:** `/app/finance/reports`  
**Audit status:** menu tree cataloged (pass 1); per-report Option pills TBD

> **Note:** Same screen title as Inv. I Reports (`C000035`) but different `prgId` and report set — accounting-focused.

## Acct. I L0 tabs (module bar)

| L0 tab | Notes |
|--------|-------|
| Setup | Chart of accounts, fiscal settings |
| Fast Entry | Quick journal entry |
| Invoice | Sales/purchase invoice accounting |
| Bank Acct./Card | Bank/card transactions |
| Cash | Cash receipts/disbursements |
| Non-Cash Transaction | Non-cash entries |
| Notes | Promissory notes |
| Fixed Assets | FA register |
| Accounting Transaction Mgmt | Voucher management |
| **Reports** | **This hub** (default on Acct. I open) |

## Reports hub categories (left / center tree)

### Communication Center
- Message Log, Sent Doc. History

### Management Resource
Cash Report · Cash Flow · Fund Statement · Fund In./De. Details · Monthly Income Statement · Monthly Cost · AR/AP Aging · AR/AP Aging Details · Management Report (`E010821` — Acct. I charts; distinct from Inv. I `E040704`) · Accounting Summary · Purchase Summary · Sales Summary · Payments Journal Sum. · Receipts Journal Sum. · S/A Journal Sum. · Custom Report

**Depth-audited pass 15:** see `screens/acct1-reports-management-resource.md` (15 screens; Custom Report catalog only)

### Book
LedgerⅠ–IV · Account In./De. Details · Sales/Purchase Book · **Journal** · Cash Book · Daily Trial Balance · Currency Ledger · Search Customer/Vendor Transactions · Customer/Vendor Book I/II

### Financial Statements
Balance Sheet · Income Statement · Schedule of Cost · Chart of Accounts Status · Compound Trial Balance · Statement of Cash Flows · Retained Earnings Statement · Statement of Operation

### Others
Accounting Transaction Status · Print Voucher · Sales Invoice Status · Purchase Invoice Status · Accounting vs. Inventory · All-In-One I · View Transaction History · **Update Balance for Accounting**

**Depth-audited pass 16:** see `screens/acct1-reports-others.md` (8 screens; N000118/N000126 cross-ref pass 11)

## Hub actions

**Update Balance for Accounting** — prominent button on hub (rebuild GL balances).

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Full GL report suite | Finance reports module partial |
| Accounting vs. Inventory | Reconciliation report missing — **crawled pass 16** |
| Update Balance for Accounting | Period close / balance rebuild TBD — **crawled pass 16** |
