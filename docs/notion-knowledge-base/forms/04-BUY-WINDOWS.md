# Buy windows — Request → Receive → Pay

Deep narrative: `../14-DEEP-BUY-REQUEST-TO-RECEIVE.md`  
Headers: `01-FORMFIELDS-REGISTRY.md` · Lines: `02-LINE-COLUMNS.md`

---

## Purchase Request — `/app/purchase-request/purchase-requests` · `pr_purchase_request`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** |
| **Header*** | request_date, location, tax, currency · partner optional · + PIC, ref, notes, project |
| **Lines** | PR line catalog |
| **Statuses** | progress: unconfirmed → e_approval → confirmed → in_progress → completed · send: unsent/sent |
| **Gates** | Submit only from unconfirmed · Approve/Reject only from e_approval · budget off/warn/block on submit · PR→PO approval policy **advisory** |
| **Stock** | None |

---

## RFQ / Supplier quotation — `/app/purchase-order/rfq`

| | |
|--|--|
| **Kind** | transaction · Form Settings **No** |
| **RFQ statuses** | draft / sent / closed / cancelled |
| **SQ statuses** | draft / received / accepted / rejected |
| **Fields** | UNKNOWN exhaustive — optional path into PO |

---

## Purchase Order — `/app/purchase-order/purchase-orders` · `po_purchase_order`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** |
| **Header*** | order_date, vendor, location, tax, currency · + PIC, ref, notes, project |
| **Lines** | PO lines (UoM, unit price, serials, optional warranty col) |
| **Statuses** | draft / confirmed / partially_received / received / cancelled · UI progress filters may show unconfirmed/e_approval/completed |
| **Gates** | Confirm from draft + has lines · `purchase_require_pr` HARD when ON · PR/PO “approval required” validators **advisory** (return nil) |
| **Stock** | None until GR |

---

## Goods Receipt — `/app/purchases/purchase-receive` · `gr_goods_receipt`

| | |
|--|--|
| **Kind** | transaction · Form Settings **Yes** (header only in registry) |
| **Header*** | receipt_date, location · + reference, notes · **PO link** in UI |
| **Lines / capture** | PO lines · serial batch / lot entry on **draft** when tracked |
| **Statuses** | draft → posted · reverse → cancelled |
| **Gates** | GR from **draft PO allowed** · serial counts HARD when required · QC inspection `held` HARD blocks post · reverse blocked if serials sold/reserved |
| **Stock** | On **post** — qty up (+ serials in_stock) |

---

## Purchase returns — `/app/purchase-order/purchase-returns`

| | |
|--|--|
| **Statuses** | create → submitted (doc) |
| **Fields / gates** | UNKNOWN |

---

## Supplier Invoice — `fin_supplier_invoice`

Paths: purchase-receive billing UI and/or `/app/finance/supplier-invoices`  
Full field table: `01` + `06-ACCOUNTING-WINDOWS.md`

| **Statuses** | unconfirmed → Submit → e_approval → Approve → completed |
| **Gates** | `purchase_require_gr_before_supplier_invoice` HARD when ON · qty ≤ open balance |
| **Stock** | None |

---

## Payment Voucher — see `06-ACCOUNTING-WINDOWS.md`

Apply to supplier invoices ≤ outstanding.

---

## Vendor credits / Expenses / Recurring expenses

| Screen | Path | Notes |
|--------|------|-------|
| Vendor credits | `/app/purchases/vendor-credits` | Statuses draft→open (post); cancelled/refunded — fields UNKNOWN |
| Expenses | `/app/purchases/expenses` | Feature `finance.expenses` — fields UNKNOWN |
| Recurring expenses | `/app/purchases/recurring-expenses` | Feature `finance.recurring_expenses` — fields UNKNOWN |

---

## Buying hubs / reports

`/app/buying`, purchase-status, pre-invoicing, payment-status, A/P by vendor, PO analysis, items-to-receive — **Kind:** hub/report.
