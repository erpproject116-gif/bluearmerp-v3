# E010201 — General Journal

**Menu path:** Acct. I → **Fast Entry** → General Journal  
**URL:** `prgId=E010201`, `menuSeq=MENUTREE_000067`, `groupSeq=MENUTREE_000010`  
**Fast Entry hub:** `prgId=C000010` (defaults to this form on tab open)  
**Bluearm target:** `/app/finance/journal`  
**Audit status:** pass 1 — live crawl Jul 7 2026 (BLUEARM COMPUTER STORE tenant)

## L0 module tab

Acct. I L0 tabs: Setup, **Fast Entry**, Invoice, Bank Acct./Card, Cash, Non-Cash Transaction, Notes, Fixed Assets, Accounting Transaction Mgmt, Reports.

## Left menu under Fast Entry (L1)

| Program | prgId |
|---------|-------|
| **General Journal** | E010201 |
| Payment Journal | E010408 |
| Receipt Journal | E010403 |
| S/A Journal | E010505 |
| Bank Reconciliation | E010208 |
| Auto Generate Voucher List | E010213 |
| New Balance Adjustment | (form) |
| Bal. Count List | (list) |
| Balance Adjustment List | (list) |
| Bal. Adjustment Status | (status) |

## Form header (L2 — no tab pills)

Single workspace; header pill label **General Journal** (type badge, not a switchable tab).

| Field | Notes |
|-------|-------|
| Voucher Date | Day / month / year pickers |
| Type | Dropdown — **General Journal** (fixed for this entry point) |
| Accounting Slip No. | Auto or manual slip number |
| Comment Details | Multi-line header remark |
| Attachment | File upload (+) |

## Line grid

| Column | Notes |
|--------|-------|
| Checkbox | Row select |
| Type | Dr/Cr line type (default **3 Dr**) |
| Account Code / Name | GL account lookup |
| Customer/Vendor Code / Name | Sub-ledger party |
| Dr. / Cr. | Amount columns; footer totals |
| Remark | Line memo |
| Additional Info. | **Enter** link per row (modal for extended fields) |

## Toolbar

| Control | Action |
|---------|--------|
| Find (F3) | Search existing vouchers |
| Load Slip | Pull inventory/finance slip into journal |
| Save (F8) | Post voucher |
| Save/Print (F7) | Save + print |
| Reset | Clear form |
| List | Navigate to journal list view |
| ECOUNT Web Uploader | Bulk import |

## Option menu (gear)

Not filter pills — settings submenu:

- Input Screen Settings
- My Code/Text Settings
- Function Setup

## Notification block (below grid)

- **Notification Target** — Select recipients
- **Notification Method** — Email, Messenger, Msg., Push to App, Attach Link

## Tab pill checklist

- [x] L0 Fast Entry module tab
- [x] L1 General Journal left menu entry
- [x] Form header fields (no L2 tab pills on form)
- [x] Option gear settings (not tab pills)
- [ ] Additional Info. modal tabs (Enter link)
- [ ] List view status pills (via **List** button)
- [ ] Payment / Receipt / S/A journal forms (separate prgIds)

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Debit/credit grid with party sub-ledger | Voucher lines exist; verify party + Additional Info parity |
| Load Slip from inventory | Partial — GR/sales posting TBD |
| Find (F3) voucher search | Journal list/search |
| 4-way journal split (General/Payment/Receipt/S/A) | Single voucher UI — needs split entry points |
| Balance adjustment subtree | Not implemented |

## Notes

- Prior crawl attempt showed empty iframe workspace; form renders inline in main shell after ~2–4s load (no iframe content required).
- Distinct from Acct. I **Reports → Book → Journal** (read-only book report).
