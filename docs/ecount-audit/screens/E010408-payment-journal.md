# E010408 — Payment Journal

**Menu path:** Acct. I → **Fast Entry** → Payment Journal  
**URL:** `prgId=E010408`, `menuSeq=MENUTREE_000068`, `groupSeq=MENUTREE_000010`  
**Bluearm target:** `/app/finance/cash/payments`, payment vouchers  
**Audit status:** pass 1 — live crawl Jul 7 2026

## Form header (L2 — type badge, not switchable tab)

| Field | Notes |
|-------|-------|
| Voucher Date | Day / month / year |
| Type | **Payment Journal** (fixed) |
| Accounting Slip No. | Slip number |
| Comment Details | Header remark |
| Attachment | File upload |

## Line grid toolbar (payment-specific)

| Control | Purpose |
|---------|---------|
| Find (F3) | Search existing payment vouchers |
| **Hold** | Hold / park payment lines |
| **Projection** | Payment projection / scheduling |
| **Bank Account Transactions** | Pull from bank activity |
| **Credit Card Activity** | Pull from card transactions |
| **Balance by Account** | Account balance lookup |
| Insert / Move Up / Move Down | Line row management |

**Not on Payment Journal:** Load Slip (present on General Journal only).

## Line grid columns

Same pattern as General Journal: Type (Dr/Cr), Account Code/Name, Customer/Vendor, Dr./Cr., Remark, Additional Info (**Enter** link).

## Footer

Save (F8), Save/Print (F7), Reset, List, ECOUNT Web Uploader

## Notification block

Target select + Email / Messenger / Msg. / Push to App / Attach Link

## vs General Journal (E010201)

| Feature | General | Payment |
|---------|---------|---------|
| Load Slip | Yes | No |
| Hold / Projection | No | Yes |
| Bank/Card integration | No | Yes |
| Use case | Manual GL entries | AP / cash-out payments |

## Tab pill checklist

- [x] L1 Payment Journal menu entry
- [x] Header fields
- [x] Payment-specific toolbar buttons
- [ ] Hold modal tabs
- [ ] Projection modal
- [ ] Bank Account Transactions picker
- [ ] Additional Info modal

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Dedicated payment journal UI | Generic payment voucher |
| Hold on payment lines | — |
| Bank/card activity import | Banking partial |
| Credit card activity link | — |
