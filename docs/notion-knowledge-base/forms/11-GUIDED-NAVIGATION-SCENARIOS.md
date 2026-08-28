# Guided navigation — click order & shortcuts

**Goal:** Know **where to click**, in **what order**, with **one-tap paths**.

> In the app: open the header **Guide** button while on Sell/Buy screens — same journeys.

---

## Big buttons (open these first)

| Goal | Click path |
|------|------------|
| **Quote → Sales Order (Load Slip)** | `/app/sales-order/sales-orders/new` → button **Load Slip** → **Quotation** |
| **Sell end-to-end** | Quote → SO → `/app/sales-order/sales-orders/release` → `/app/sales/sales/new` → `/app/finance/official-receipts/new` |
| **Buy end-to-end** | `/app/purchase-request/purchase-requests/new` → PO → `/app/purchases/purchase-receive/new` → `/app/finance/payment-vouchers/new` |
| **Receive with serials** | `/app/inventory/serial-lot/receive` or Bill draft + scan |
| **What Load Slip copies / files needed** | See [Load Slip & attachments](13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md) |
| **Save failed?** | See [Submission errors](12-FORM-SUBMISSION-ERRORS.md) |
| **Turn gates / attachments on-off** | `/app/user-management/process-policies` |

---

## A. Quote → SO via Load Slip (most asked)

1. List quotes → `/app/quotation/quotations`  
2. New SO → `/app/sales-order/sales-orders/new`  
3. Pick **Customer** (filters open lines)  
4. Click **Load Slip** → **Quotation** → tick lines → OK  
5. Click **Save**

**Also works:** Quotations list → select row → **Generate slip** → Sales Order  
**Rules admin:** `/app/user-management/mapping-center`

**Carries:** customer, location, tax, currency, PIC, lines (item, balance qty, price). Consumes quote residual.  
**Details:** [Load Slip & attachments](13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md)

---

## B. Full sell (Quote → cash)

| Step | Open |
|------|------|
| 1. Quotation | `/app/quotation/quotations/new` |
| 2. Sales Order (+ Load Slip) | `/app/sales-order/sales-orders/new` |
| 3. Release / Pick list | `/app/sales-order/sales-orders/release` |
| 4. Delivery notes (if needed) | `/app/sales-order/delivery-receipts` |
| 5. Set SO **Completed** | SO list/modal |
| 6. Sales Invoice (+ Load Slip → SO) | `/app/sales/sales/new` |
| 7. Get paid (OR) | `/app/finance/official-receipts/new` or `/app/finance/receivables` |

---

## C. Sales Invoice — Load Slip sources

On `/app/sales/sales/new` → **Load Slip**:

| Source | Use when |
|--------|----------|
| **Sales Order** | Normal bill after fulfill (attachments copy on Save) |
| **Quotation** | Skip SO if policy allows |
| **Shipping Order** | Bill shipped lines |

---

## D. Full buy (Request → pay)

| Step | Open |
|------|------|
| 1. PR | `/app/purchase-request/purchase-requests/new` |
| 2. Approvals (if needed) | `/app/dashboard/approvals` |
| 3. PO (+ Load Slip → PR) | `/app/purchase-order/purchase-orders` |
| 4. Confirm PO | PO list → **Confirm** |
| 5. Bill / Receive (+ Load Slip → PO) | `/app/purchases/purchase-receive/new` |
| 6. Pay vendor | `/app/finance/payment-vouchers/new` or `/app/finance/payables` |

Optional RFQ: `/app/purchase-order/rfq`

---

## E–J. Other common jumps

| Topic | Open |
|-------|------|
| Serial registry | `/app/inventory/serial-lot/registry` |
| Stock Entry | `/app/inventory/stock-entries` |
| Stock Adjustment | `/app/inventory/stock-adjustments` |
| Chart of accounts | `/app/finance/acct-i/chart-of-accounts` |
| POS | `/app/pos` · Manage `/app/pos/manage` |
| CRM leads | `/app/crm/leads` |
| Setup | `/app/setup` |
| Help journeys | `/app/documentation/kb/quotation-to-sales-flow` · `/app/documentation/kb/purchase-request-to-ap-flow` |

---

## Load Slip vs Generate slip (plain English)

| Method | Where | Best for |
|--------|-------|----------|
| **Load Slip** | Button on **New/Edit** form | Filling the form you already opened |
| **Generate slip** | List toolbar (select rows first) | Convert from a list |
| **Mapping Center** | `/app/user-management/mapping-center` | Admin rules / bulk |

There is **no** “Load Slip” item in the sidebar.

---

## Load Slip — what each target can pull

| You are creating… | Best source | Residual consumed? |
|-------------------|-------------|--------------------|
| Sales Order | Quotation | Yes |
| Sales Invoice | Sales Order | Yes (+ files copy on Save) |
| Purchase Order | PR or RFQ | Yes |
| Bill / Receive | Purchase Order | Yes |
| Cross sell↔buy | Opposite side | **No** (map-only) |

Full table: [13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md](13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md)

---

## Attachments (when Confirm is blocked)

1. **Save** as Unconfirmed  
2. Upload ≥1 file in **Attachments**  
3. Then Confirm / Completed / Submit  

Toggle rules: `/app/user-management/process-policies`  
Which docs + typical files: [Load Slip & attachments](13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md) §3
