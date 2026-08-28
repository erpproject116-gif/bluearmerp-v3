# Deep dive — Sell: Quotation → Official Receipt

**Audience:** product owner, ops lead, superadmin  
**Evidence:** Observed in playbooks / ADR 0005 / module APIs  
**Companion:** `modules/03-sell-chain.md`, `04-CROSS-MODULE-HANDOFFS.md`, `05-PROCESS-POLICIES-AND-GATES.md`

---

## 1. End-to-end map (what becomes what)

| Step | Document | Plain purpose | Screen |
|-----:|----------|---------------|--------|
| 1 | Quotation | Price offer | `/app/quotation/quotations` |
| 2 | Sales Order | Customer accepted; commit to deliver | `/app/sales-order/sales-orders` |
| 3 | Release / Pick | Take or reserve stock for the order | `/app/sales-order/sales-orders/release` |
| 4 | Delivery note | Proof goods left warehouse | `/app/sales-order/delivery-receipts` |
| 5 | Sales Invoice | Bill the customer | `/app/sales/sales` |
| 5b | Combined invoice (optional) | Group several invoices | `/app/sales/collective-invoicing/list` |
| 6 | Official Receipt | Record customer payment | `/app/finance/receivables` / official receipts |

Optional side paths: Shipping order / Delivery trip; Load Slip from Quotation or Shipping directly into Sales Invoice (skip SO path).

---

## 2. Status vocabulary (plain + technical)

### Quotation

| Field | Values (technical) | Plain meaning |
|-------|-------------------|---------------|
| progress_status | `unconfirmed` → `in_progress` → `completed` | Draft → Working → Done |
| voucher_status | `none` → `partial` → `completed` | How much of the quote was converted to SO lines |

**No** separate submit/approve workflow on quotation (**Observed**).

### Sales Order

| Field | Values | Plain meaning |
|-------|--------|---------------|
| progress_status | `unconfirmed`, `in_progress`, `completed` | Draft → Working → **Done** |
| fulfillment_status | `none` / `partial` / `completed` | How much released vs ordered |

Release queues may also show `e_approval` as a filter — SO approval policy at release is **advisory**.

### Delivery note

| Values | Plain |
|--------|-------|
| `draft` → `posted` | Preparing → Delivered recorded |

### Sales Invoice

| Values | Plain | How you get there |
|--------|-------|-------------------|
| `unconfirmed` | Draft | Save |
| `e_approval` | Waiting approval | **Submit** only (cannot PATCH directly) |
| `completed` | Approved / Done | Approve (`sales.approve`) |
| reject → `unconfirmed` | Back to Draft | Reject + remarks |

### Combined invoice (header)

`unconfirmed` / `e_approval` / `confirmed` / `cancelled` — here `e_approval` is a **label only** (free PATCH), not an approval queue.

### Shipping / trips

| Entity | Statuses |
|--------|----------|
| Shipping order | `draft` \| `confirmed` \| `shipped` \| `cancelled` |
| Delivery trip | `planned` \| `in_progress` \| `completed` \| `cancelled` |

---

## 3. Handoff conditions (must meet before next)

### A. Quotation → Sales Order

| Condition | Hard / Soft | Notes |
|-----------|-------------|-------|
| Convert quote lines into SO | — | Updates quote `voucher_status` |
| Policy `sales_require_quotation` | **Hard when ON** | SO create needs source quotation |
| Attachment at target progress | When policy on | May block progress move |

### B. Sales Order → Release / Pick

| Condition | Hard / Soft | Notes |
|-----------|-------------|-------|
| Enough stock for release | **Hard** | No partial txn on insufficient stock (docs) |
| Serial items scanned | **Hard** if tracked | One serial per unit |
| Policy `sales_require_so_approval` | **Soft (advisory)** | Validator does not block |
| Credit limit | When `sales_enforce_credit_limit` on | Often checked when moving to `in_progress` |

**What release does depends on policy:**

| `legacy_combined_so_release` | Release does | Invoice later checks |
|------------------------------|--------------|----------------------|
| `true` (default) | Lowers on-hand | **released − invoiced** |
| `false` (split) | Raises reserved only | **delivered − invoiced** (after DR posts) |

### C. Release → Delivery note

| Mode | Meaning |
|------|---------|
| Combined | DR mostly paperwork |
| Split | DR **post** lowers on-hand and reserved |

DR: create as `draft`, then **post**.

### D. Sales Order → Sales Invoice (**critical**)

| Condition | Hard / Soft |
|-----------|-------------|
| SO `progress_status` = **`completed`** | **HARD** — `in_progress` is not enough |
| Qty on invoice ≤ released−invoiced (combined) OR delivered−invoiced (split) | **HARD** |
| Policy `sales_require_delivery_receipt` ON | **HARD** — qty ≤ delivered |
| Policy `sales_require_so` ON | **HARD** — blocks direct SI without SO-linked lines |
| Load Slip sources | SO / Quotation / Shipping open lines / or direct sale |

SO-path invoices do **not** deduct stock again (release/DR already did). Direct sales may deduct.

### E. Sales Invoice → Combined invoice (optional)

| Condition |
|-----------|
| SI `completed` and not yet `invoicing_status` |
| Confirm collective header → sets linked sales `invoicing_status = true` |
| Cannot link/unlink when header `confirmed` or `cancelled` |

### F. Sales Invoice → Official Receipt

| Condition |
|-----------|
| Apply payment against SI |
| Receipt status progresses `none` / `partial` / `full` |

---

## 4. Recommended operator sequence (happy path)

1. Create Quotation (customer, lines, tax/currency).  
2. Convert → Sales Order (or create SO; respect quote-required policy).  
3. Move SO progress; release lines (pick).  
4. Optional: create & **post** Delivery note (required for qty if DR policy on / split mode).  
5. Set SO progress to **`completed`**.  
6. New Sale → Load Slip from SO → save Draft → **Submit** → **Approve** → Done.  
7. Collect via Official Receipt / Receivables.  

**Proven demos:** S2, S4 (direct invoice), S9 (order → delivery → invoice).

---

## 5. Stuck? Dashboard red flags

- Quote not converted  
- SO not fully released  
- Reserved without delivery note (split)  
- Delivered without invoice  
- Serial mismatches  

---

## 6. Policy cheat sheet (sell only)

| Policy | Effect when ON |
|--------|----------------|
| `sales_require_quotation` | SO needs quote |
| `sales_require_so` | SI needs SO lines |
| `sales_require_delivery_receipt` | SI qty ≤ delivered (**enforced**) |
| `legacy_combined_so_release` | Combined vs split stock behavior |
| `sales_require_so_approval` | **Advisory** — does not hard-block |
| `sales_enforce_credit_limit` | Credit check |
