# Purchase flow (Ecount-aligned)

| Step | Ecount (typical) | Bluearm route | Notes |
|------|------------------|---------------|-------|
| Purchase Request | Inv. I Purchases | `/app/purchase-request/purchase-requests` | |
| RFQ / Supplier quote | | `/app/buying` RFQ screens | |
| Purchase Order | New PO E040301 | `/app/purchase-order/purchase-orders` | Load Slip from RFQ/PR |
| Goods Receipt | GR list C000032 | `/app/purchase-order/goods-receipt` | |
| Purchase Invoice | New Purchases E040303 | `/app/purchases/purchases` | Load Slip PO/GR/RFQ; Cash Out post-save |
| Pay | Cash Out - To Vendor E010409 | `/app/finance/payment-vouchers` | Disbursements hub |

Start from **MyPage → Learn / Flow Chart** when unsure which screen to open.
