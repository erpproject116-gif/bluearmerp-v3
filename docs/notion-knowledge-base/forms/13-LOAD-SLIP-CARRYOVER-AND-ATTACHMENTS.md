# Load Slip carry-over & attachments by window

**Purpose:** For each transaction, show **what Load Slip copies into the new form**, what it **does not** copy, whether it **consumes residual qty**, and **what attachments are required** (if Process Policies say so).  
**Evidence:** Observed — `LoadSlipMenu.tsx`, apply*Lines in Sell/Buy modals, `processpolicy/attachments.go`, `useProcessPolicy.ts`.  
**Related:** Guided nav `11` · Errors `12` · Policies `../05-PROCESS-POLICIES-AND-GATES.md`

---

## Legend

| Term | Meaning |
|------|---------|
| **Consume residual** | Open qty on the source line is reduced when you save the destination (true Load Slip fulfill). |
| **Map-only** | Copies item/qty for convenience; **does not** consume the other module’s residual ledger; **does not** adopt the other side’s partner as customer/vendor. |
| **Header carry** | Customer/vendor, location, tax, currency, PIC, etc. filled from first picked line’s source doc. |
| **Line carry** | Item, description, balance qty, prices, UoM, remarks, source line FK, serial flags. |
| **Attachment carry** | Source files previewed and **copied onto the new document when you Save** (where implemented). |

---

## 1. Load Slip carry-over by destination

### 1.1 New Sales Order ← Quotation (primary)

| Carries over | Detail |
|--------------|--------|
| Header | Customer, Location-Out, tax type, currency, PIC |
| Link | `source_quotation_id` |
| Lines | Item, description, **balance qty**, unit price (VAT-inc), UoM, remark, `source_quotation_line_id` |
| Tax math | Lines recalculated for destination tax mode |
| Consume residual | **Yes** (quotation open lines) |

| Does **not** typically carry | Notes |
|------------------------------|-------|
| Quotation-only notes / validity text | Re-enter on SO if needed |
| Attachments auto-copy | **UNKNOWN / not observed** on SO←Quote path the same way as SI←SO (verify UI); still upload on SO if policy ON |
| Map-only PR/PO lines | Item/qty merge only — no vendor→customer, no buying residual consume |

**Shortcut:** `/app/sales-order/sales-orders/new` → **Load Slip** → Quotation.

---

### 1.2 New Sales Invoice ← Sales Order (primary)

| Carries over | Detail |
|--------------|--------|
| Header | Customer, location, tax, currency, PIC |
| Also when present on SO | Payment terms, notes, project |
| Link | `source_sales_order_id` · line `source_sales_order_line_id` |
| Lines | Item, description, balance qty, price, UoM, remark, `track_serial` |
| **Attachments** | Preview “From Sales Order…” → **copies when you Save** |
| Consume residual | **Yes** (SO open-to-invoice qty) |

Toast (Observed): *“Sales Order lines loaded. Attachments copy when you Save.”*

---

### 1.3 New Sales Invoice ← Quotation

| Carries over | Same pattern as SO←Quote for header + lines + `source_quotation_line_id` |
| Attachments | Preview “From Quotation…” → **copies when you Save** |
| Consume residual | **Yes** (quote open lines) — subject to `sales_require_so` if ON (may block blank SI without SO) |

---

### 1.4 New Sales Invoice ← Shipping Order

| Carries over | Customer, location, tax, currency, PIC · lines from SO linked to shipping · `source_sales_order_line_id` · track_serial |
| Attachments | From linked **Sales Order** when SO id present → copy on Save |
| Consume residual | Via SO line linkage |

---

### 1.5 New Sales Invoice ← PR / PO / GR (**map-only**)

| Carries over | Item + qty (+ serial track flag where provided) **merged into lines** |
| Does **not** | Adopt vendor as customer · consume buying residual · invent SO link |
| Use | Rare cross-map; prefer proper sell chain |

---

### 1.6 New Quotation ← Prior Quotation

| Carries over | Open lines from another quote (copy) |
| Also map-only | PR / PO item lines |
| Import | RFQ PDF/images → extracted lines (Import group) |

---

### 1.7 New Purchase Request ← SO / Quotation

| Carries over (SO/Quote) | Tax, currency · lines (item, balance qty, prices) · demand context |
| Map-only | PO lines (no residual consume) |
| Partner | Optional supplier on PR — not forced from customer |

---

### 1.8 New Purchase Order ← Purchase Request (primary)

| Carries over | Tax, currency, location, PIC · vendor if set on PR · lines (item, qty, price, UoM, remark, `purchase_request_line_id`, track_serial, planned serials) |
| Consume residual | **Yes** (PR open balance) |

### 1.9 New Purchase Order ← Supplier Quotation (RFQ)

| Carries over | Vendor, tax/currency/location when present, PIC · lines + `supplier_quotation_line_id` / RFQ line refs |
| Consume residual | Accepted SQ / RFQ open qty |

### 1.10 New Purchase Order ← SO / Quotation (**map-only**)

| Carries over | Item/qty only |
| Does **not** | Adopt customer as vendor |

---

### 1.11 New Bill / Purchase Receive ← Purchase Order (preferred)

| Carries over | Lines: item, balance qty, price, UoM, `purchase_order_line_id`, track_serial, warranty months |
| Header | Operator usually already has vendor/tax/currency/location; PO load focuses on lines (set header to match PO) |
| Consume residual | **Yes** (PO open to receive/bill) |
| Stock/serials | Confirm path posts stock + serials when receiving |

### 1.12 New Bill ← Purchase Receive (legacy)

| Carries over | Unbilled GR lines (`goods_receipt_line_id`) · item/qty/price |
| Use | Bill-only after separate receive history |

### 1.13 New Bill ← RFQ / SO / Quotation

| RFQ | PO lines from accepted quotes |
| SO/Quote | **Map-only** item/qty |

---

### 1.14 Repair Order ← SO / Quote / PR

| SO | Copy item lines from open SO |
| Quote / PR | Map-only / demand hints |

---

## 2. What Load Slip never replaces

- **You still Save** the destination document.  
- **Serial scans** on GR/SI/POS — Load Slip may set `track_serial` / planned serials but **physical scan** still required when capture policy says so.  
- **Approvals / confirm** — still Submit/Approve/Confirm after save.  
- **Official Receipt / Payment Voucher** — no Load Slip; apply outstanding invoices instead.  
- **Stock Entry / Adjustment / JE / CoA** — no Load Slip.

---

## 3. Attachments by transaction window

### 3.1 Policy-gated documents (Process Policies)

Toggle location: `/app/user-management/process-policies` (also mirrored on some Form settings / Setup).

| Document | Policy key | When checked | Typical file (ops guidance) | Form settings href |
|----------|------------|--------------|-----------------------------|--------------------|
| Quotation | `quotation_require_attachment` | Progress → **in_progress** or **completed** | Signed quote PDF, customer RFQ | `/app/quotation/quotations/settings` |
| Sales Order | `sales_order_require_attachment` | Progress → **in_progress** or **completed** | Signed SO / PO from customer | `/app/sales-order/sales-orders/settings` |
| Sales Invoice | `sales_require_attachment` | Progress → **completed** or **e_approval** | Signed SI, delivery proof | `/app/sales/sales/settings` |
| Purchase Order | `purchase_order_require_attachment` | **Confirm** (draft → confirmed) | Vendor PO / email PDF | `/app/purchase-order/purchase-orders/settings` |
| Bill (Supplier Invoice) | `supplier_invoice_require_attachment` | → **completed** or **e_approval** | **DR / vendor SI** (UI label) | `/app/purchases/purchase-receive/settings` |

**Rule (Observed):** At least **one** file on that document.  
**Operator order:** Save as Unconfirmed → upload in Attachments → then Confirm / In Progress / Completed / Submit.

Message: *“At least one attachment is required before confirming…”*

**Presets:** Some Process Policy presets turn SO/SI/PO/Bill attachment **ON** and quotation **OFF** by default — check your tenant.

### 3.2 Attachment carry when using Load Slip (Observed)

| Flow | Attachment behavior |
|------|---------------------|
| SI ← Sales Order | Source SO files previewed → **copied on Save** |
| SI ← Quotation | Source quote files previewed → **copied on Save** |
| SI ← Shipping (via SO) | Linked SO files → **copied on Save** |
| SO ← Quotation | Prefer upload on SO if policy ON (auto-copy **not** same toast path as SI) |
| Bill ← PO | Still upload DR/vendor SI when Bill attachment policy ON (Load Slip does not replace vendor paper) |

Carried files **count toward** the destination’s attachment requirement after Save (SI uses preview + own uploads in client check).

### 3.3 Windows with attachments UI but **no** process-policy “require file” gate

| Window | Attachments? | Required by policy? |
|--------|--------------|---------------------|
| Purchase Request | May have files | **No** attachment policy key Observed |
| Delivery Receipt | Ops may attach | **No** same DocKind gate |
| Official Receipt | Usually none for policy | **No** |
| Payment Voucher | Usually none for policy | **No** |
| Stock Adjustment | Optional attachments | **No** confirm-file policy (approval remarks instead) |
| Goods Receipt (legacy) | Serial/scan primary | Bill policy applies on Bill confirm |
| POS | Receipt branding / manage | **No** doc attachment policy |
| CoA / JE | N/A | **No** |

Support tickets have their own attachment APIs — separate from sell/buy confirm gates.

### 3.4 Practical “what file to attach” (ops recommendation)

| Window | Recommended attachment | Required? |
|--------|-------------------------|-----------|
| Quotation | Customer-approved quote / RFQ | Only if policy ON |
| Sales Order | Signed customer PO / SO | Only if policy ON |
| Release / DR | Packing list / waybill | Not policy-gated; useful for audit |
| Sales Invoice | Signed SI / delivery ack | Only if policy ON (may already be filled via Load Slip copy) |
| Purchase Request | Internal approval scan | Optional |
| Purchase Order | Vendor acknowledgment | Only if policy ON |
| Bill / Purchase Receive | **Delivery receipt + vendor supplier invoice** | Only if policy ON — UI emphasizes DR / vendor SI |
| OR / PV | Bank slip / deposit | Optional ops practice |

---

## 4. Quick matrix — Load Slip + attachments together

| Destination | Best Load Slip source | Residual | Attachments on confirm |
|-------------|----------------------|----------|------------------------|
| Sales Order | Quotation | Consume | SO policy |
| Sales Invoice | Sales Order | Consume + **copy SO files on Save** | SI policy |
| Sales Invoice | Quotation | Consume + **copy quote files on Save** | SI policy |
| Purchase Order | PR or RFQ | Consume | PO Confirm policy |
| Bill | PO (preferred) | Consume | Bill policy (upload DR/vendor SI if ON) |
| Bill | GR (legacy) | Unbilled lines | Same Bill policy |
| Cross-module map | Opposite side | **No** consume | Still destination’s own policy |

---

## 5. How to turn requirements on/off

1. `/app/user-management/process-policies` — per-document “Require file…” toggles.  
2. Or Form settings cog for that entity (links in §3.1).  
3. After changing policy, re-test Confirm / Completed on a draft.

---

## Maintenance

When a new apply*Lines path adds header fields or attachment copy: update §1 and §3.2 in the same PR.
