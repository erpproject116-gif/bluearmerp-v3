# E010403 — Receipt Journal

**Menu path:** Acct. I → **Fast Entry** → Receipt Journal  
**URL:** `prgId=E010403`, `menuSeq=MENUTREE_000069`, `groupSeq=MENUTREE_000010`  
**Bluearm target:** `/app/finance/cash/receipts`, official receipts  
**Audit status:** pass 1 — live crawl Jul 7 2026

## Form header (L2 — type badge)

| Field | Notes |
|-------|-------|
| Voucher Date | Day / month / year |
| Type | **Receipt Journal** (fixed) |
| Accounting Slip No. | Slip number |
| Comment Details | Header remark |
| Attachment | File upload |

## Line grid toolbar (receipt-specific)

| Control | Purpose |
|---------|---------|
| Find (F3) | Search existing receipt vouchers |
| **Hold** | Hold receipt lines |
| **Projection** | Receipt projection |
| **Bank Account Transactions** | Pull from bank deposits |
| **Payment Agency Details** | Payment gateway / agency lines |
| Insert / Move Up / Move Down | Line row management |

**Not on Receipt Journal:** Credit Card Activity, Balance by Account (those are Payment-only in this tenant).

## Line grid columns

Same Dr/Cr grid as General/Payment journals with Additional Info (**Enter**).

## Footer

Save (F8), Save/Print (F7), Reset, List, ECOUNT Web Uploader

## vs Payment Journal (E010408)

| Feature | Payment | Receipt |
|---------|---------|---------|
| Credit Card Activity | Yes | No |
| Balance by Account | Yes | No |
| Payment Agency Details | No | Yes |
| Use case | Cash out / AP | Cash in / AR |

## Tab pill checklist

- [x] L1 Receipt Journal menu entry
- [x] Header fields
- [x] Receipt-specific toolbar buttons
- [ ] Hold / Projection modals
- [ ] Payment Agency Details picker
- [ ] Additional Info modal

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Dedicated receipt journal UI | Official receipt vouchers partial |
| Payment agency integration | — |
| Bank deposit import | Banking partial |
