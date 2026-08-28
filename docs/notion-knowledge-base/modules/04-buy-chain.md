# Module — Purchase Request, Purchase Order, Purchase Receive, Buying overview

## Purchase Request

**Path:** `/app/purchase-request/purchase-requests` (default new: `.../new`)  
**Purpose:** Internal ask to buy.

### Statuses

| Field | Values |
|-------|--------|
| progress_status | `unconfirmed`, `e_approval`, `confirmed`, `in_progress`, `completed` |
| send_status | `unsent`, `sent` |

### Happy path

1. Create PR (optional: load from Sales Order lines).  
2. Submit → `e_approval`.  
3. Approver (`purchase_request.approve`) Approve → `confirmed` + `approved_at`, or Reject (+ remarks) → `unconfirmed`.  
4. Convert to Purchase Order.

### Gates

- Submit only from `unconfirmed`; approve/reject only from `e_approval`.  
- Budget control on submit (`ValidateBudgetControl`).  
- If policy forces confirmed via Approve, manual PATCH to `confirmed` blocked.  
- PO side: **advisory** flag — PO from Unconfirmed / pending PR still allowed (ADR 0005).

### Proven

S10.

---

## Purchase Order (+ RFQ)

**Path:** `/app/purchase-order/purchase-orders` · RFQ `/app/purchase-order/rfq`  
**Purpose:** Order from supplier; shop vendors via RFQ.

### Statuses

| Entity | Values |
|--------|--------|
| PO status | `draft`, `confirmed`, `partially_received`, `received`, `cancelled` |
| PO progress filters | `unconfirmed`, `e_approval`, `completed` |
| RFQ | `draft`, `sent`, `closed`, `cancelled` |
| Supplier quotation | `draft`, `received`, `accepted`, `rejected` |
| Purchase return | create → `submitted` via `/submit` |

### Happy path

1. Create PO from PR / supplier quote / standalone (policy may require PR).  
2. Confirm (`purchase_order.purchase_orders_confirm`): only **draft** → `status=confirmed`, `progress_status=completed`; writes PR slip lines.  
3. Receive via Goods Receipt.  
4. Optional returns.

### Gates on confirm

Must be draft; must have lines; budget; attachments / `ValidatePurchaseOrderConfirm`; PO approval check is **advisory** (does not block).

### Goods receipt note

GR may be created while PO is still `draft` (intentional flexibility with advisory PO approval).

---

## Purchase Receive (Goods Receipt + AP hub)

**Path:** `/app/purchases/purchase-receive`  
**Purpose:** Receive stock against PO; then bill and pay.

### Features

Purchase receive · New Payable Payment · Expenses · Recurring Expenses · Vendor Credits · Reports · Pre-invoicing · Payment status · A/P by vendor · Setup

### Goods Receipt statuses

`draft` → `posted`; reverse → `cancelled`

### Happy path

1. Create draft GR from PO (PO may be `draft` / `confirmed` / `partially_received` — intentional).  
2. Scan serials/lots while draft.  
3. QC: if inspection `held`, post blocked; `released` allows post.  
4. Post (`goods_receipts_post`) → stock up; serials `in_stock`; optional warranty.  
5. Create Supplier Invoice against posted GR (required if policy on).  
6. Pay via Payment Voucher / Payables.  

Vendor credits: `draft` → `open` via post; `cancelled` / `refunded` (**Observed** finance notes).

### Gates

- Post only draft; serial counts must match for tracked lines.  
- Reverse blocked if serials sold/reserved or insufficient stock.  
- `purchase_require_gr_before_supplier_invoice` when on.

### Proven

S2, S3, S5, S8.

---

## Purchase overview (`buying`)

**Path:** `/app/buying`  
Workspace + expenses + purchase status + pre-invoicing — owner hub over the buy spine.

---

## Builder pointers

- `docs/modules/purchase-request/README.md`  
- `docs/modules/inventory/serial-lot/README.md` (GR/serial)  
- `docs/modules/finance/README.md` (AP)  
- APIs: `purchaserequest`, `purchaseorder`, `goodsreceipt`, `finance`
