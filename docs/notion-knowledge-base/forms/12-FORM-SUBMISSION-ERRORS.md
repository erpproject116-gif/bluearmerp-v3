# Form submission errors — prevent, diagnose, fix

**Purpose:** Operator/PO catalog of **save / submit / post / approve** failures by module, with **cause** and **fix**.  
**Evidence:** Observed UI toasts + API validators (paths cited).  
**Companion:** Guided nav `11-GUIDED-NAVIGATION-SCENARIOS.md` · Process policies `../05-PROCESS-POLICIES-AND-GATES.md`

---

## How to use

1. Note the **screen** and **action** (Save, Submit, Release, Post, Checkout, Approve).  
2. Match the **message** (or closest) in the module table.  
3. Apply **Fix**. If policy-related, open `/app/user-management/process-policies` or module Setup.  
4. Prevent next time with the **Prevention** checklist at the top of each section.

In-app help often mirrors these (`helpScenarioArticles`: `load-slip-no-lines`, `serial-count-mismatch`, `insufficient-stock-on-release`, `foundation-setup-blocked-api`, …).

---

## 0. Universal patterns (all modules)

| Symptom | Cause | Fix / prevent |
|---------|-------|----------------|
| `Please fill in required fields: {labels}.` | Form Settings required empty | Fill listed fields; review cog Settings for entity |
| `Please fill in required custom fields: …` | Tenant custom field required | Fill custom section |
| `At least one attachment is required before confirming…` | Attachment-on-confirm policy | Attach file **before** confirm / e_approval, or turn policy off |
| `Could not reach the API…` | Network / API down | Retry; check API |
| Module disabled toast | Feature/module off | `/app/user-management/tenant-modules` |
| `Confirmation remarks are required to approve.` / `Rejection remarks are required.` | Empty remarks | Enter remarks on Approve/Reject |
| Foundation `ERR_SETUP_INCOMPLETE` (403) on **Buy/POS** | Setup incomplete | Finish `/app/setup` (company, CoA types, currency/tax, policies ack, location, partner, item) |
| Selling POST | Soft reminder only for foundation | Still complete CoA for posting quality |

Shared code: `handleSaveResult.ts`, `useFormFieldSettings.ts`, `setupreadiness`, `useProcessPolicy.ts`.

### Prevention checklist (every transaction)

1. Correct **partner**, **location**, **tax**, **currency**.  
2. ≥1 line with **qty > 0** and registered **item**.  
3. Correct **status** for the action (don’t PATCH to `e_approval` — use Submit).  
4. Tracking: serial **count = qty** or lot selected when required.  
5. Stock available at location for issues/sales/releases.  
6. Upstream doc ready (quote/SO/PR/PO/GR) when policy HARD.  
7. Attachments if policy ON.

---

## 1. Sell (Quotation · SO · Release · DR · SI)

### Prevention

- Load Slip after selecting customer.  
- SO **Completed** before SO→SI.  
- Release / DR before SI when policies require.  
- Serials after setting whole-number qty.

| Action | Error / condition (Observed) | Fix |
|--------|------------------------------|-----|
| Save Quote/SO/SI | Select transaction type / currency / customer / location | Fill header |
| Save | Required fields / custom fields list | Fill listed |
| Confirm + attachment policy | Attachment required | Attach or disable policy |
| Create SO | `A quotation is required before creating a sales order…` | Load Slip Quotation / Generate slip / link quote (`sales_require_quotation`) |
| Create SI | `Direct sales are disabled…create a Sales Order…` | Invoice from SO (`sales_require_so`) |
| SI lines | `At least one line with quantity is required.` | Add lines |
| SI lines | `Register the product in Inventory before saving…` | Create item first |
| SI edit | `Cannot edit a sale pending approval.` | Wait Approve/Reject |
| SI progress | `Use Submit for approval.` | Don’t set e_approval via Save |
| Credit | `Customer is on credit hold.` / `Credit limit exceeded…` | Clear hold / collect OR / lower amount |
| SI qty vs DR | `Quantity exceeds delivered quantity…` | Post DR or lower qty (`sales_require_delivery_receipt`) |
| Confirm SI stock | `insufficient stock at location` | Receive/transfer to location |
| Serial/lot | serials required / count must match / lot required | Scan or pick lot |
| Scan | `Serial is on a purchase order but not in stock…` (`ERR_SERIAL_NOT_RECEIVED`) | Complete Purchase Receive |
| Scan | Serial on draft receive | Confirm GR |
| Scan | not found / wrong location / unavailable / wrong item | Fix registry |
| Line | `{serial} is already on this sale.` | Remove duplicate |
| Release | Enter release qty / positive / exceeds remaining | Fix qty |
| Release | Reservation required / line must be reserved | Confirm SO / free stock (split mode) |
| Release | Serial selection / count / not available | Match in-stock serials |
| Release | `Exceeds balance (X available).` | Lower qty |
| Undo release | Invoiced / serials sold | Don’t undo after SI |
| DR | Only draft can post / need released lines / exceeds released | Release first; post drafts |
| Load Slip empty | No open lines | Wrong partner, or source already fully converted |

Evidence: `SalesModal`, `SalesOrderModal`, `sales.go`, `releases.go`, `validate.go`, `tracking_policy.go`.

---

## 2. Buy (PR · PO · GR · Bill · PV)

### Prevention

- Confirm PO before heavy receive (open lines).  
- Scan serials to match qty before Confirm.  
- PR approved if workflow used.  
- GR-before-bill when policy ON.

| Action | Error / condition | Fix |
|--------|-------------------|-----|
| Save PR/PO/Bill | Transaction type / currency / location (/ vendor) | Fill header |
| Create PO | `A purchase request is required…` | Link PR (`purchase_require_pr`) |
| Bill | GR required / qty exceeds received | Receive first or lower qty |
| PR/PO API | At least one line with quantity | Add lines |
| PR | Use Approve when approval required / wrong status | Submit → Approve path |
| PR reject | Remarks required | Enter remarks |
| Bill confirm | `serial count (…) must equal qty (…)` | Set qty then scan |
| Bill | Cannot edit pending approval / cannot reverse confirmed | Use Submit/Approve; don’t unconfirm posted |
| GR post | Only draft / inspection-released | Release QC hold then post |
| GR | Only draft accepts serials | Scan on draft |
| Lot | Lot qty exceeds open / not lot-tracked | Fix lot |
| RFQ | Add at least one line | Add items |
| PO from PR | Select a purchase request | Pick source |
| Foundation | Complete workspace / CoA / currency / location / partner / item | `/app/setup` |

Evidence: `SupplierInvoiceModal`, `purchase_*.go`, `goods_receipts.go`, `bill_receive.go`, `validate.go`.

---

## 3. Inventory (masters · Entry · Adjustment)

| Action | Error / condition | Fix |
|--------|-------------------|-----|
| Item save | Item name required | Fill name |
| Item | Cannot disable serial/lot with open units/batches | Close/void units first |
| Stock Entry | Incomplete type/locations/lines | Fill then Post |
| Stock Entry post | `insufficient stock` / no balance / only drafts | Check Find Stock; post drafts only |
| Adjustment UI | Reason / item+location / non-zero delta | Fill |
| Adjustment | Only draft update/submit; pending for approve | Draft → Submit → Approve + remarks |
| Adjustment approve | Remarks required | Enter remarks |

---

## 4. Serial & Lot

| Action | Error / condition | Fix |
|--------|-------------------|-----|
| Register | Item+location; serial required; qty must be **1** | Fix fields |
| Register | `Serial number already exists.` | Use unique serial |
| Generate | Item+location; qty 1–200 | Generate then print |
| Transfer | Need serials + dest; insufficient stock | Valid in-stock units |
| Adjustment | Reason; non-zero; insufficient stock | Fix qty |
| Doc policy | count must match qty / serials required / lot required | Match scans |
| Scan bar | not_received / not_found / unavailable | Receive or register first |

≠ Stock Adjustment (qty approval) — different screen.

---

## 5. Accounting (OR · PV · JE · credits)

| Action | Error / condition | Fix |
|--------|-------------------|-----|
| JE | ≥2 lines with account codes / Invalid account code | Valid CoA codes |
| JE post | Must balance | Equal debit/credit |
| JE post | Must be approved first | `finance_require_je_approval` → approve |
| JE | Only drafts post | Post drafts |
| OR | Required header; ≥1 sales application with amount | Apply to SI |
| OR | Update/delete blocked if JE posted | Reverse JE first if allowed |
| PV | Vendor + currency; ≥1 invoice application | Apply to supplier invoices |
| OR/PV | Negative / over-apply | Fix amounts |
| Credit notes / vendor credits | Draft-only post; amount exceeds remaining; JE posted blocks cancel | Follow lifecycle |

---

## 6. Chart of accounts

| Action | Error / condition | Fix |
|--------|-------------------|-----|
| Save | Account code/name required; invalid type | Fix fields |
| Save | `Account code already exists.` | Unique code |
| Edit | Code/type locked after posted entries | New account + deactivate old |
| Delete | System / has children / used in posted entries | Deactivate instead |
| Import | Chart not empty without Replace | Empty or Replace intentionally |
| Defaults | Account not found/inactive/wrong type | Pick active account of allowed type |
| Disable types | Cannot disable asset/liability/income/expense | Keep core types |

---

## 7. POS

| Action | Error / condition | Fix |
|--------|-------------------|-----|
| Open | Select location / already open session | Pick location; close prior |
| Cart | Open session; item+qty | Open shift; valid catalog |
| Checkout | Empty cart; tenders; tender &lt; due; PWD/Senior/guest ID | Cover total; fill IDs |
| Checkout | No walk-in customer / tax / currency | Configure in Manage + masters |
| Checkout | stock / serials / lots / accounting field errors | Fix stock/serials/CoA mappings |
| Close | Enter counted cash | Full close amount |
| Any | Foundation incomplete | `/app/setup` |

---

## 8. Load Slip / Generate slip (conversion)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty open-lines picker | Wrong partner; no residual; source cancelled/fully used | Match customer/vendor; check source open qty |
| Map-only didn’t reduce source | By design | Use consuming Load Slip option or Generate rule |
| Generate disabled | No row selected | Select list row(s) |
| Policy blocks blank SO/SI | `sales_require_quotation` / `sales_require_so` | Convert from upstream doc |

Help IDs: `load-slip-overview`, `load-slip-no-lines`, `mapping-center-when-to-use`.

---

## 9. HTTP 409 / conflict codes (operators)

| Code | Meaning | Fix |
|------|---------|-----|
| `ERR_SERIAL_NOT_RECEIVED` | Serial on PO/draft only | Confirm Purchase Receive |
| `ERR_SERIAL_WRONG_LOCATION` | Wrong warehouse | Scan at correct location |
| `ERR_SERIAL_UNAVAILABLE` | Not in_stock | Check registry status |
| `ERR_SERIAL_WRONG_ITEM` | Serial belongs to other item | Scan correct item |
| `ERR_SETUP_INCOMPLETE` | Foundation | Setup wizard |
| `ERR_CONFLICT` | e.g. expense already paid / CoA code clash | Follow message; don’t double-pay |

---

## 10. Status machine mistakes (quick)

| Mistake | Right action |
|---------|----------------|
| PATCH progress to `e_approval` | **Submit for approval** |
| Edit while `e_approval` | Wait Approve/Reject |
| SI from SO not Completed | Complete SO first |
| Post GR while QC held | Release inspection |
| Post JE unbalanced | Balance lines |
| Adjust stock hoping for instant change | **Approve** adjustment |
| Undo release after invoice | Too late — reverse via returns/credit process |

---

## Related deep dives

| Topic | File |
|-------|------|
| Sell statuses/gates | `../13-DEEP-SELL-QUOTE-TO-RECEIPT.md` |
| Buy | `../14-DEEP-BUY-REQUEST-TO-RECEIVE.md` |
| Inventory/Serial | `../15-…` · `09-SERIAL-LOT-WINDOWS.md` |
| Accounting | `../16-…` · `10-CHART-OF-ACCOUNTS.md` |
| Guided order | `11-GUIDED-NAVIGATION-SCENARIOS.md` |

---

## Maintenance

When a new toast or validator is added: append the matching module table + help article ID if any.
