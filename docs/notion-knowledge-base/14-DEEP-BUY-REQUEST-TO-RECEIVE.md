# Deep dive — Buy: Purchase Request → Goods Receipt → Pay

**Audience:** product owner, ops lead, superadmin  
**Evidence:** Observed in playbooks / ADR 0005 / module APIs  
**Companion:** `modules/04-buy-chain.md`, `04-CROSS-MODULE-HANDOFFS.md`, `05-PROCESS-POLICIES-AND-GATES.md`

---

## 1. End-to-end map (what becomes what)

| Step | Document | Plain purpose | Screen |
|-----:|----------|---------------|--------|
| 1 | Purchase Request | Internal ask to buy | `/app/purchase-request/purchase-requests` |
| 1b | RFQ / Supplier quote (optional) | Shop vendors | `/app/purchase-order/rfq` |
| 2 | Purchase Order | Order from supplier | `/app/purchase-order/purchase-orders` |
| 3 | Goods Receipt | Receive into stock | `/app/purchases/purchase-receive` |
| 4 | Supplier Invoice | Supplier bill | Finance / payables path |
| 5 | Payment Voucher | Pay the supplier | `/app/finance/payables` / payment vouchers |

Also: PR can load lines from a Sales Order (buy-to-order). Purchase returns: create → `submitted`.

---

## 2. Status vocabulary (plain + technical)

### Purchase Request

| Field | Values (technical) | Plain meaning |
|-------|-------------------|---------------|
| progress_status | `unconfirmed` | Draft |
| | `e_approval` | Waiting approval (after **Submit**) |
| | `confirmed` | Approved |
| | `in_progress` | Being worked / ordered |
| | `completed` | Done |
| send_status | `unsent` / `sent` | Whether sent onward |

**Real approval workflow:** Submit / Approve (`purchase_request.approve`) / Reject (+ remarks).

| Action | Allowed from | Result |
|--------|--------------|--------|
| Submit | `unconfirmed` only | → `e_approval` |
| Approve | `e_approval` only | → `confirmed` + `approved_at` |
| Reject | `e_approval` only | → `unconfirmed` |
| Budget control | On submit | `ValidateBudgetControl` (off / warn / block) |

### Purchase Order

| Field | Values | Plain meaning |
|-------|--------|---------------|
| status | `draft` | Not yet confirmed to supplier |
| | `confirmed` | Ordered |
| | `partially_received` | Some qty received |
| | `received` | Fully received |
| | `cancelled` | Cancelled |
| progress filters | `unconfirmed`, `e_approval`, `completed` | List filters |

**Confirm action** (`purchase_order.purchase_orders_confirm`):

| Must be true | Result |
|--------------|--------|
| status = `draft` | → `status=confirmed`, `progress_status=completed` |
| Has lines | Required |
| Budget / attachments | May apply |
| PO approval policy | Checked but **advisory** (does not block) |

### RFQ / Supplier quotation

| Entity | Values |
|--------|--------|
| RFQ | `draft` / `sent` / `closed` / `cancelled` |
| Supplier quotation | `draft` / `received` / `accepted` / `rejected` |

### Goods Receipt

| Values | Plain |
|--------|-------|
| `draft` | Receiving in progress (scan serials/lots here) |
| `posted` | Stock updated |
| reverse → `cancelled` | Undo post (blocked if serials sold/reserved or insufficient stock) |

### After receive (AP)

| Document | Notes |
|----------|-------|
| Supplier Invoice | Real approve path (`finance.supplier_invoices_approve`) |
| Payment / receipt reports | `none` / `partial` / `full` |
| Vendor credits | `draft` → `open` via post; `cancelled` / `refunded` |

---

## 3. Handoff conditions (must meet before next)

### A. (Optional) Sales Order lines → Purchase Request

| Condition | Notes |
|-----------|-------|
| Load SO lines into PR | Supported — buy-to-order |

### B. Purchase Request → Purchase Order

| Condition | Hard / Soft | Notes |
|-----------|-------------|-------|
| Create PO from PR (`from-purchase-request`) | — | Primary path |
| Policy `purchase_require_pr` | **Hard when ON** | Standalone PO without PR blocked |
| Policy `purchase_require_pr_approval` | **Soft (advisory)** | PO from **Unconfirmed / pending** PR still **allowed** |
| PR Submit/Approve buttons | Work | Only the **conversion gate** is soft |

### C. RFQ / Supplier quote → Purchase Order

Optional vendor shopping; then create/confirm PO.

### D. Purchase Order → Goods Receipt

| Condition | Hard / Soft | Notes |
|-----------|-------------|-------|
| Create draft GR from PO | — | PO may be `draft`, `confirmed`, or `partially_received` (**intentional**) |
| Policy `purchase_require_po_approval` | **Soft (advisory)** | Does **not** block GR on draft PO |
| Serial/lot scan while draft | **Hard** if tracked | Counts must match on post |
| QC inspection `held` | **HARD** | Blocks **post** until `released` |
| Post GR | Must be draft | → on-hand up; serials `in_stock`; optional warranty |

### E. Goods Receipt → Supplier Invoice

| Condition | Hard / Soft |
|-----------|-------------|
| Policy `purchase_require_gr_before_supplier_invoice` ON | **HARD** — bill lines need posted GR balance |
| Policy OFF | Bill without posted GR may be allowed |

### F. Supplier Invoice → Payment Voucher

| Condition |
|-----------|
| Apply payment to supplier invoices |
| Status `none` / `partial` / `full` |

---

## 4. Recommended operator sequence (happy path)

1. Create Purchase Request (optional: from SO lines).  
2. **Submit** → Approver **Approve** → `confirmed` (recommended ops discipline even though conversion is soft).  
3. Create PO from PR (or RFQ → PO).  
4. **Confirm** PO (only from `draft`).  
5. Create Goods Receipt from PO → scan serials if needed → (QC release if held) → **Post**.  
6. Create Supplier Invoice (respect GR-before-bill policy) → submit/approve if used.  
7. Pay via Payment Voucher / Payables.  

**Proven demos:** S2, S3, S5, S8, S10 (PR approval → PO).

---

## 5. Stuck? Dashboard red flags

- Open PO not received  
- Goods received without supplier bill  
- Payment over-applied  
- Serial mismatches  

Reconciliation: `gr-without-supplier-invoice`, `ap-over-application`.

---

## 6. Policy cheat sheet (buy only)

| Policy | Effect when ON |
|--------|----------------|
| `purchase_require_pr` | PO needs PR (**enforced**) |
| `purchase_require_gr_before_supplier_invoice` | Bill needs posted GR (**enforced**) |
| `purchase_require_pr_approval` | **Advisory** — does not block PR→PO |
| `purchase_require_po_approval` | **Advisory** — does not block GR/bill |
| `budget_control_mode` | Off / warn / block on PR submit |

---

## 7. What operators often get wrong

1. Thinking PR must be Approved before PO can exist — **conversion is soft** today.  
2. Thinking PO must be Confirmed before GR — **GR from draft PO is allowed**.  
3. Forgetting QC **held** blocks GR post.  
4. Selling advisory toggles to customers as hard gates — do not.
