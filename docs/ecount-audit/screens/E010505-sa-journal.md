# E010505 — S/A Journal

**Menu path:** Acct. I → **Fast Entry** → S/A Journal  
**URL:** `prgId=E010505`, `menuSeq=MENUTREE_000070`, `groupSeq=MENUTREE_000010`  
**Bluearm target:** `/app/finance/journal/sa` (sales & acquisition / payroll-related journal)  
**Audit status:** pass 1 — live crawl Jul 7 2026 (BLUEARM COMPUTER STORE tenant)

## Form header (L2 — type badge, not switchable tab)

| Field | Notes |
|-------|-------|
| Voucher Date | Day / month / year |
| Type | **S/A Journal** (fixed) |
| Accounting Slip No. | Slip number |
| Comment Details | Header remark |
| Attachment | File upload |

## Line grid toolbar (S/A-specific)

| Control | Purpose |
|---------|---------|
| Find (F3) | Search existing S/A vouchers |
| **Hold** | Hold / park S/A lines |
| Insert / Move Up / Move Down / Delete Selected | Line row management |

**Not on S/A Journal (vs Payment/Receipt):** Load Slip, Projection, Bank Account Transactions, Credit Card Activity, Balance by Account, Payment Agency Details.

## Line grid columns (distinct from Payment Journal)

| Column | Notes |
|--------|-------|
| **Employee Code / Employee Name** | Primary sub-ledger — payroll / S&A employee (Payment uses Withdrawal Account instead) |
| Account Code / Account Name | GL account |
| Customer/Vendor Code / Name | Party sub-ledger |
| Amount | Line amount |
| Fees | Fee column |
| Remark Name | Line memo |
| Additional Info. | **Enter** link per row |

Extended hidden columns (same pattern as other journals): Remark Code, Dr/Cr remark codes, Dept., Project, Add. Text/Numeric/Date/Code types 1–5+.

## Footer

Save (F8), Save/Print (F7), Reset, List

**Not observed on S/A:** ECOUNT Web Uploader (present on General/Payment/Receipt in this tenant).

## Notification block

Target select + Email / Messenger / Msg. / Push to App / Attach Link

## 4-way journal comparison (Fast Entry)

| Feature | General | Payment | Receipt | **S/A** |
|---------|---------|---------|---------|---------|
| Load Slip | Yes | No | No | No |
| Hold | No | Yes | Yes | **Yes** |
| Projection | No | Yes | Yes | **No** |
| Bank Account Transactions | No | Yes | Yes | **No** |
| Credit Card Activity | No | Yes | No | **No** |
| Balance by Account | No | Yes | No | **No** |
| Payment Agency Details | No | No | Yes | **No** |
| Primary sub-ledger column | Dr/Cr Type | Withdrawal Account | Dr/Cr grid | **Employee** |
| ECOUNT Web Uploader | Yes | Yes | Yes | **No** |

## Tab pill checklist

- [x] L1 S/A Journal menu entry
- [x] Header fields
- [x] S/A-specific toolbar (Find + Hold only)
- [x] Employee Code/Name line columns
- [ ] Hold modal tabs
- [ ] Additional Info modal (Enter link)
- [ ] List view status pills (via **List** button)

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Dedicated S/A journal UI with employee sub-ledger | Single generic voucher UI |
| Hold on S/A lines | — |
| Separate entry point from payment/receipt journals | 4-way split not implemented |

## Notes

- Direct hash navigation to `E010505` loads reliably; in-session left-menu click after other Fast Entry forms may leave `.contents` empty until full page hash reload (~20s timeout observed).
- **S/A** = Sales & Acquisition (or Salaries & Acquisition) journal in ECount — employee-centric cash/accrual entries distinct from AP payment or AR receipt journals.
