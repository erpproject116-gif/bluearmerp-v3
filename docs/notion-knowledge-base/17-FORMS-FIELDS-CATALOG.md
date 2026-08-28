# Forms & fields catalog — hub

**Open this first when you want screens, fields, click order, or “why Save failed.”**

---

## Click here first (how-to)

| I need to… | Open |
|------------|------|
| **See the click order** (Quote→SO, Load Slip, sell/buy path) | [Guided navigation](forms/11-GUIDED-NAVIGATION-SCENARIOS.md) |
| **Fix a Save / Post / Approve error** | [Submission errors](forms/12-FORM-SUBMISSION-ERRORS.md) |
| **See what Load Slip copies + which files are required** | [Load Slip & attachments](forms/13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md) |
| **Ask the PO what feels implemented wrong** | [PO interview questions](forms/14-PO-INTERVIEW-WRONG-IMPLEMENTATION.md) |

---

## Open the product (common screens)

Paste into the browser after your tenant host (example: `https://your-app/app/...`).

| Do this | Path |
|---------|------|
| New Quotation | `/app/quotation/quotations/new` |
| New Sales Order (+ Load Slip → Quote) | `/app/sales-order/sales-orders/new` |
| Pick list / Release | `/app/sales-order/sales-orders/release` |
| New Sales Invoice | `/app/sales/sales/new` |
| Official Receipt (get paid) | `/app/finance/official-receipts/new` |
| New Purchase Request | `/app/purchase-request/purchase-requests/new` |
| Purchase Orders | `/app/purchase-order/purchase-orders` |
| Bill / Purchase Receive | `/app/purchases/purchase-receive/new` |
| Payment Voucher (pay vendor) | `/app/finance/payment-vouchers/new` |
| Serial receive | `/app/inventory/serial-lot/receive` |
| Chart of accounts | `/app/finance/acct-i/chart-of-accounts` |
| Process policies (gates & attachments) | `/app/user-management/process-policies` |
| Approvals queue | `/app/dashboard/approvals` |
| POS terminal | `/app/pos` |
| Setup wizard | `/app/setup` |

---

## Field catalogs by area

| Area | Open |
|------|------|
| All screens list | [Screen matrix](forms/00-INDEX.md) |
| Form Settings (19 cog entities) | [Registry](forms/01-FORMFIELDS-REGISTRY.md) |
| Line columns | [Line columns](forms/02-LINE-COLUMNS.md) |
| Sell | [Sell windows](forms/03-SELL-WINDOWS.md) |
| Buy | [Buy windows](forms/04-BUY-WINDOWS.md) |
| Inventory | [Inventory windows](forms/05-INVENTORY-WINDOWS.md) |
| Accounting | [Accounting windows](forms/06-ACCOUNTING-WINDOWS.md) |
| POS / CRM / Service | [POS CRM Service](forms/07-POS-CRM-SERVICE.md) |
| Ops / HR / Admin | [Ops HR Admin](forms/08-OPS-HR-CMS-ADMIN.md) |
| Serial & Lot | [Serial & Lot](forms/09-SERIAL-LOT-WINDOWS.md) |
| Chart of accounts | [CoA](forms/10-CHART-OF-ACCOUNTS.md) |

---

## How to read a catalog row

| Word | Meaning |
|------|---------|
| **Kind** | master · transaction · report · hub · config |
| **\*** | Required (default or hard rule) |
| **Gate** | What blocks Save / Submit / Post / Approve |
| **UNKNOWN** | Do not promise — not verified |

---

## Status / handoff deep dives

| Topic | File |
|-------|------|
| Sell Quote→Receipt | [13](13-DEEP-SELL-QUOTE-TO-RECEIPT.md) |
| Buy Request→Pay | [14](14-DEEP-BUY-REQUEST-TO-RECEIVE.md) |
| Inventory / Serial | [15](15-DEEP-INVENTORY-SERIAL-MOVEMENTS.md) |
| Accounting | [16](16-DEEP-ACCOUNTING-FORMS.md) |
| POS | [18](18-DEEP-POS.md) |
| CRM | [19](19-DEEP-CRM.md) |
| Policies | [05](05-PROCESS-POLICIES-AND-GATES.md) |
