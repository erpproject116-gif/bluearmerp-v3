# Module — Quotation, Sales Order, Sales, Selling overview

## Quotation

**Path:** `/app/quotation/quotations` · Quote board: `/app/crm/pipelines/quotations`  
**Purpose:** Customer price offers. Tax types live under Taxes (`quotation.tax_mngt`).

### Statuses

| Field | Values |
|-------|--------|
| progress_status | `unconfirmed` (default), `in_progress`, `completed` |
| voucher_status | `none` → `partial` → `completed` (as SO consumes quote lines) |

### Happy path

1. New quotation with customer, lines, tax/currency.  
2. Move progress as work advances.  
3. Convert into Sales Order (updates voucher_status).  
4. Optional: Email / Share to chat (Comms).  

No separate submit/approve workflow found in quotation module (**Observed**).

### Gates

- Attachment policy may require files at target progress.  
- Outstanding report: balance qty; optional stock check when `require_stock=true`.

### Handoffs

→ Sales Order · → Sales invoice (Load Slip source) · CRM board · Operations create-from-work-item · Booking convert

---

## Sales Order

**Path:** `/app/sales-order/sales-orders`  
**Purpose:** Commit to deliver; release stock; delivery notes; shipping.

### Key features

Sales orders · Pick list (release) · Delivery notes · Fulfillment / SO / shipment reports · Shipping orders / rules / trips · Setup

### Statuses

| Field | Values |
|-------|--------|
| progress_status | `unconfirmed`, `in_progress`, `completed` (+ release queue may filter `e_approval`) |
| fulfillment_status | `none` / `partial` / `completed` |
| Delivery note | `draft` → `posted` |

### Happy path

1. Create SO (from quote if policy requires).  
2. Progress work; credit limit may apply when moving to `in_progress`.  
3. Release lines (pick list) — stock or reserve per policy.  
4. Optional: post delivery note.  
5. Set SO **`completed`** before creating sales invoice from SO.  
6. Invoice remaining balance.

### Gates

- `sales_require_quotation` → need source quotation.  
- Release: no partial txn on insufficient stock (**docs**); serial pick for tracked items.  
- Undo release blocked if serials already sold.  
- `sales_require_so_approval` checked at release but **advisory** (validator always allows).
- Create SI from SO: progress must be **`completed`**.

### Shipping (Sales Order module) — G-12 closed

| Fact | Evidence |
|------|----------|
| Shipping order statuses | `draft` \| `confirmed` \| `shipped` \| `cancelled` |
| Delivery trip statuses | `planned` \| `in_progress` \| `completed` \| `cancelled` |
| Defaults | SO create → `draft`; from-lines → `draft`; trip → `planned` |
| Picker | excludes `cancelled` shipping orders |
| Lock | migration `266` + API normalize helpers |

### Policy fork

See Process Policies — `legacy_combined_so_release`. DR qty gate when `sales_require_delivery_receipt` is on is **enforced**.

### Proven

S2, S9.

---

## Sales (customer invoices)

**Path:** `/app/sales/sales`  
**Purpose:** Bill the customer. SO-path invoices do **not** deduct stock (release/DR already did). Direct sales may deduct.

### Features (high level)

Sales · categories · retainer / recurring · credit notes · pre-invoicing · price batch · returns · commissions · collection reports · New Receivable Payment · Combined invoices sub-branch · Setup

### Statuses

| Field | Values |
|-------|--------|
| progress_status | `unconfirmed` → `e_approval` (via Submit) → `completed`; reject → `unconfirmed` |
| invoicing_status | bool — collective confirm sets true |
| Sales return | `draft` → `submitted` |
| Collective header | `unconfirmed` / `e_approval` / `confirmed` / `cancelled` |

### Collective invoice `e_approval` (G-14 closed)

**Observed:** `collective_invoices.go` `patchCollectiveInvoiceStatus` — **no** submit/approve/reject endpoints.

- Status is set by free `PATCH .../collective-invoices/{id}/status` among the four allowed values.
- `e_approval` is a **label only** here (header state); it does not start an approval queue workflow like Sales or Supplier Invoice.
- `confirmed` → sets linked sales `invoicing_status = true`.
- `cancelled` → deletes link rows (unlinks sales).
- Link/unlink blocked when header is `confirmed` or `cancelled`.

### Happy path

1. New Sale — Load Slip from SO / Quote / Shipping open lines (or direct).  
2. Save as unconfirmed.  
3. Submit for approval → approve (`sales.approve`) → completed.  
4. Optional: add to combined invoice when completed and not yet invoicing_status; PATCH collective status (including optional `e_approval` label) → `confirmed` when ready.  
5. Collect via Official Receipt / Receivables.

### Gates

- SO-linked: SO completed; qty ≤ released−invoiced or delivered−invoiced.  
- Policies: require SO, require DR qty, attachments, credit limit.  
- Cannot PATCH progress directly to `e_approval` — use Submit.  
- Reject needs remarks.

### Collection reports (under Sales / Selling / Finance)

Official Receipt Status · SI Receipt Status (`none`/`partial`/`full`) · A/R by customer · Discount status · Print slips · Customer credit  

Permissions named in collections docs (e.g. `sales.si_receipt_status`) — **Doc-backed**.

### Proven

S2, S3, S4, S9.

---

## Sale overview (`selling`)

**Path:** `/app/selling`  
Workspace + reports hub (Sales Status, Receivable Status, Commissions). Same commercial spine; navigation convenience for owners.

---

## Builder pointers

- `docs/modules/quotation/README.md`  
- `docs/modules/sales-order/README.md`  
- `docs/modules/sales/README.md`, `collective-invoicing.md`, `collections.md`  
- APIs under `quotation`, `salesorder`, `deliveryreceipt`, `sales`, `shipping`
