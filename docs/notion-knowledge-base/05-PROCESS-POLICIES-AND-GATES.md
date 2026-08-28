# Process policies and gates

**Where to configure:** User Management → Process Policies (`/app/user-management/process-policies`)  
**Storage:** `tenant_process_policies` (migration `051`)  
**Code:** `api/internal/platform/processpolicy/`  
**ADR:** `docs/adr/0005-process-flows-and-policies.md` (amended 2026-08)

> Superadmins: this page is the company’s “strict vs skip-friendly” switchboard.  
> Developers: some toggles are **enforced**; three approval toggles are **advisory** (validators intentionally return nil).

---

## A. Enforced defaults (ADR 0005 amended)

| Policy | Default | When on (live) |
|--------|---------|----------------|
| `purchase_require_gr_before_supplier_invoice` | `false` | Supplier invoice lines need posted GR balance |
| `purchase_require_pr` | `false` | Standalone PO without PR blocked |
| `sales_require_quotation` / `sales_require_so` | `false` | SO needs quote / SI needs SO lines |
| `sales_require_delivery_receipt` | `false` | **Enforced** — SI qty ≤ delivered qty |
| `legacy_combined_so_release` | `true` | Release deducts on-hand immediately |
| `finance_require_je_approval` | `false` | **Enforced** — JE post needs approval; auto-post → draft |

### Release mode explained

**Combined (default, `legacy_combined_so_release = true`)**

- Release lowers `qty_on_hand`  
- Delivery note is mostly paperwork  
- Sales invoice balance = released − invoiced  

**Split (`legacy_combined_so_release = false`)**

- Release raises `qty_reserved` only  
- Delivery note post lowers on-hand and reserved  
- Sales invoice balance = delivered − invoiced  

---

## B. Advisory flags (intentional — not broken)

UI labels say **(advisory)**. Call sites still invoke validators; validators return `nil`.

| Policy | What operators may expect | What API does today |
|--------|---------------------------|---------------------|
| `purchase_require_pr_approval` | Block PO until PR approved | Allows Unconfirmed / pending PR → PO |
| `sales_require_so_approval` | Block release/invoice until SO approved | Allows release/invoice |
| `purchase_require_po_approval` | Block GR/Bill until PO approved | Allows GR on draft PO and billing path |

PR submit/approve/reject workflow still works. Only the **conversion gate** is relaxed.

**Product decision (2026-08):** keep advisory until a deliberate re-enable PR flips validators + tests. Do not re-train as hard gates.

Shared copy: `web/src/shared/processPolicyFieldMeta.ts`, Process Policies page, Module Setup hub.

---

## C. Other flags in code (`policy.go`)

| Policy family | Examples | Effect when enforced |
|---------------|----------|----------------------|
| Selling credit | `sales_enforce_credit_limit` | Credit check on SO progress / sales create |
| Selling reservation | `sales_require_reservation` | Release/DR qty vs reserved |
| Attachments | `*_require_attachment` | Confirm needs file at target progress |
| Budget | `budget_control_mode` | `off` / warn / block on PR submit |
| Accounts auto-post | `accounts_auto_post_sales`, `purchase`, `or`, `pv` | Auto JE; downgraded if JE approval required |
| Inventory | `inventory_gl_hybrid_enabled`, serial/stock adjustment approval flags | GL / approval behavior |

---

## D. Resolved doc ↔ API conflicts

| Topic | Resolution |
|-------|------------|
| PR / SO / PO approval | **Advisory by design** — ADR + UI + PR README updated |
| `sales_require_delivery_receipt` | **Live** — ADR no longer says “future” |
| GR on PO `draft` | Allowed (matches relaxed PO approval) — document as intentional flexibility |
| SO → Sales invoice | Create-from-SO still needs SO **`completed`** |

---

## E. Foundation gate (not a process policy, but blocks everything)

Until setup wizard required steps complete → API blocks transactional POSTs (selling / buying / POS).

Required: company → COA → currency/tax → process policies → location → partners → items.

**Observed:** `setupreadiness`; help `setup-wizard`.

---

## F. Feature codes (show / hide areas)

Configured under User Management → Module & Features. Nav reads these via `isTenantFeatureEnabled`.

| featureCode | What it unlocks |
|-------------|-----------------|
| `inventory.serial_lot` | Serials / batch & serial sub-branch |
| `inventory.wms` | Warehouse scheduled receipts |
| `inventory.price_lists` | Price lists |
| `manufacturing.boms` | BOMs |
| `manufacturing.work_orders` | Work orders |
| `sales.collective_invoicing` | Combined invoices |
| `finance.acct_i` | Ledger / bookkeeping |
| `finance.acct_ii` | Receivables & payables hubs |
| `finance.payment_vouchers` | Supplier payments sub-branch |
| `quotation.tax_mngt` | Taxes |
| `finance.expenses` | Expenses |
| `finance.recurring_expenses` | Recurring expenses |
| `finance.vendor_credits` | Vendor credits |
| `finance.statutory_read` | BIR Statutory |
| `process_policies` | Process Policies tab |

**Observed:** `modules.ts`; migrations `057` / `187` and related.

---

## G. Permission snippets (partial — not a full matrix)

| Action | Permission signal (Observed) |
|--------|------------------------------|
| Submit / approve sales invoice | `sales` write; `sales.approve` |
| Submit / approve purchase request | `purchase_request` write; `purchase_request.approve` |
| Confirm purchase order | `purchase_order.purchase_orders_confirm` (RequireSubmit) |
| Post goods receipt | `purchase_order.goods_receipts_post` |
| Reverse goods receipt | `purchase_order.goods_receipts_reverse` |
| Post journal entry | `finance.journal_entries_post` |
| Official receipt create | `finance.official_receipts_new` write |
| Official receipt update | `finance.official_receipts` write |
| Collective invoice | `sales.collective_invoice_list`, `sales.collective_invoice_status` |
| CMS publish | `cms.pages_publish` |
| Dashboard pieces | `dashboard.view`, `kpis`, `charts`, `red_flags`, `financial_summary` |

Full matrix: still open (gap G-13).

---

## H. Reconciliation endpoints (operational truth)

| Check | Meaning |
|-------|---------|
| `reserve-without-dr` | Released qty not on posted delivery note |
| `dr-without-invoice` | Delivered qty not invoiced |
| `gr-without-supplier-invoice` | Posted GR not fully billed |
| `ap-over-application` | Payments exceed invoice total |

**Observed:** ADR 0005; dashboard red flags; inventory reconciliation APIs.

---

## I. Superadmin rollout recipe

1. Finish setup wizard.  
2. Leave policies **skip-friendly** for training (matches golden demos).  
3. Populate Demo Data; walk S2 and S10.  
4. For production: enable only **enforced** gates you need (quote/SO/DR qty/GR-before-bill/JE approval). Treat advisory approval toggles as reminders, not locks.  
5. If enabling split release (`legacy_combined_so_release = false`), train warehouse on delivery note posting before go-live.  
6. Record the final policy screenshot in the tenant’s runbook.
