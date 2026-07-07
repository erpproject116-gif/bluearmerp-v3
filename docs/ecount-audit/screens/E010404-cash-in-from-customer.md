# E010404 — Cash In - From Customer

**Menu path:** Acct. I → **Cash** → Cash In → **Cash In - From Customer**  
**URL:** `prgId=E010404`, `menuSeq=MENUTREE_000324`, `groupSeq=MENUTREE_000080`  
**Bluearm target:** `/app/finance/cash/receipts` (customer receipt voucher)  
**Audit status:** pass 1 — live crawl Jul 7 2026

## Form fields

| Field | Notes |
|-------|-------|
| Voucher Date | Default today |
| Deposit Account | Bank/cash GL account |
| Customer | Party lookup |
| Amount | Receipt amount |
| Fees | Bank fees |
| Remark | |
| Accounting Slip No. | Linked GL voucher |
| Attachment | |

## Actions

Save (F8), Save/Print (F7), Reset, **List**

## Sibling programs (Cash In subtree)

| Program | prgId |
|---------|-------|
| From Employee | `E010401` |
| Receipt Journal | `E010403` |
| From Merchant Account | `E010405` |
| Bank Loan | `E010406` |
| From Others | `E010407` |

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Standalone cash receipt voucher | Partial — tied to sales Cash In modal on `E040205` |
| Deposit account + fees split | Receipt voucher bank fees |

## Related

- Sales save **Cash In** modal on New Sales — see `E040205-new-sales.md`
- AR payment via **Receipts Journal** on `E060402` — see `acct2-breadth.md`

## Tab pill checklist

- [x] Header fields + Save actions
- [ ] Link to AR apply / invoice allocation
