# Sales flow (Ecount-aligned)

Chain for Bluearm Computer Store daily ops. Prefer starting from **MyPage → Flow Chart**.

| Step | Ecount (typical) | Bluearm route | Notes |
|------|------------------|---------------|-------|
| Quotation | Inv. I → Sales → Quotation | `/app/quotation/quotations` | Free-text lines OK; SO needs registered items |
| Sales Order | New Sales Order E040203 | `/app/sales-order/sales-orders` | Load Slip from quotation |
| Sales | Sales List C000030 / New E040205 | `/app/sales/sales` | Load Slip; Cash In post-save |
| Receipt | Cash In - From Customer E010404 | `/app/finance/official-receipts` | Also Collections hub |

After save on Sales, use **Cash In** or **Link accounting voucher** (post-save dialog) — do not invent a second invoice elsewhere.
