# E010409 — Cash Out - To Vendor

**Menu path:** Acct. I → **Cash** → Cash Out → **Cash Out - To Vendor**  
**URL:** `prgId=E010409`, `menuSeq=MENUTREE_000330`, `groupSeq=MENUTREE_000080`  
**Bluearm target:** `/app/finance/cash/payments` (vendor payment voucher)  
**Audit status:** pass 1 — live crawl Jul 7 2026

## Form fields

| Field | Notes |
|-------|-------|
| Voucher Date | Default today |
| Withdrawal Account | Bank/cash GL account |
| Customer | Vendor party lookup (labeled "Customer" in ECount) |
| Amount | Payment amount |
| Fees | Bank fees |
| Remark | |
| Accounting Slip No. | Linked GL voucher |
| Attachment | |
| Notification Target | Select + Email/Messenger/Msg./Push to App |

## Actions

Save (F8), Save/Print (F7), Reset, **List**

## Sibling programs (Cash Out subtree)

| Program | prgId |
|---------|-------|
| Payment Journal | `E010408` |
| Receipt | (list) |
| To Employee | `E010410` |
| Bank Transfer | `E010411` |
| To Credit Card | `E010412` |
| Loan Repayment/Interest | `E010413` |
| To Others | `E010414` |

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Standalone cash payment voucher | Partial — AP payment via `E060502` Payments Journal |
| Withdrawal account + fees split | Payment voucher bank fees |
| Notification on save | Not implemented |

## Related

- AP payment via **Payments Journal** on `E060502` — see `acct2-breadth.md`
- Mirror of **Cash In - From Customer** `E010404` — see `E010404-cash-in-from-customer.md`

## Tab pill checklist

- [x] Header fields + Save actions
- [ ] Link to AP apply / invoice allocation
