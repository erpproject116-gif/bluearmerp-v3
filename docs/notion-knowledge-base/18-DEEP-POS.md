# Deep dive — POS (terminal, shifts, checkout)

**Audience:** product owner, retail ops, superadmin  
**Evidence:** Observed — `082_pos.sql`, `api/internal/modules/pos/`, playbook `08-pos-hr.md`, help/KB

---

## 1. Screens

| Screen | Path | Who |
|--------|------|-----|
| Terminal | `/app/pos` | Cashier (`pos.terminal`, `pos.checkout`) |
| Manage | `/app/pos/manage` | Managers only (`pos.manage`) |

Module depends on **inventory + sales**. Enable under Module & Features.

---

## 2. Happy path

1. Finish foundation setup (blocks POS writes until ready).  
2. Manage: catalog, tax, tenders, default location, auto-post.  
3. **Open shift** — location + `opening_cash` → status **`open`**.  
4. Sell / hold bills on terminal.  
5. Serial-tracked lines: attach serials (**one per unit**).  
6. **Checkout** → creates completed Sales Invoice + reduces stock.  
7. **Close shift** — `closing_cash` / variance → status **`closed`**.  
8. Optional auto-post SI/OR (Manage settings).

---

## 3. Shift statuses (Hard)

| Status | Meaning |
|--------|---------|
| `open` | Active; cart/checkout allowed; **one open session per cashier** |
| `closed` | Ended; no further cart |

No suspended/third status.

---

## 4. What Checkout creates (Observed)

| Effect | Detail |
|--------|--------|
| Sales document | `sa_sales` with `progress_status=completed`, `invoicing_status=true` |
| Stock | `ApplyStockDelta(..., "pos_checkout")` when item tracks inventory qty |
| Serials | Applied like sale; marked sold |
| Lots | Applied when lot-tracked |
| Accounting | Optional auto SI/OR post when enabled |

---

## 5. Fields & gates

### Open shift

| Field | Required |
|-------|----------|
| Location | Yes |
| Opening cash | Yes |

### Checkout cart

| Gate | Rule |
|------|------|
| Foundation incomplete | **Hard** — POS writes blocked |
| Stock available | **Hard** for qty-tracked items |
| Serial count = qty | **Hard** for `track_serial` items |
| Session must be `open` | **Hard** |

### Close shift

| Field | Notes |
|-------|-------|
| Closing cash | Counted drawer |
| Variance | Opening + sales − closing (ops review) |

### Manage (observed topics)

Products (price, VIP, POS visibility) · Categories · Default location · Tax inclusive/exclusive · Tenders · Order types · Auto-post SI/OR · Privilege % (senior/PWD/student) · Branding · Modifiers · Logs

---

## 6. Permissions

| Code | Use |
|------|-----|
| `pos.terminal` | Terminal |
| `pos.sessions` | Sessions |
| `pos.checkout` | Cart / checkout / hold |
| `pos.manage` | Manage |

---

## 7. Cashier shell v2 (flagged)

**Flag:** `pos_cashier_shell_v2` — see runbook `docs/runbooks/POS_CASHIER_SHELL_V2.md`.

| Decision | Choice |
|----------|--------|
| D14 PWA | Keep ERP `start_url`; POS uses in-app install coach (not `/app/pos` as install home) |
| D15 Shift diary | Phase 3b session activity + end-of-shift Z + transaction annex |
| Void-last | Reversal via `POST …/void-last`; restores `pos_checkout` stock; exclusive POS ORs reversed; multi-invoice OR blocks |
| Receipt | Checkout `receipt_format` snapshot + slip UI; OR title only when OR# present |
| Cash drawer | in/out affect expected cash; `coin_exchange` audited & excluded; no revenue JE on drawer or close |

---

## 8. UNKNOWN / caveats

- Offline queue internals — roadmap  
- Whether POS checkout always syncs CRM warranty assets like Sales create — **verify** (possible gap)  
- Exhaustive Manage field settings list — extend catalog later  
- Void-last API shipped (`POST /pos/sessions/{id}/void-last`) — see runbook 

---

## 9. Compare to retail ops

| Your question | Bluearm |
|---------------|---------|
| Who opens the drawer? | Open shift |
| Does checkout bill the customer? | Yes — completed SI |
| Does stock drop at checkout? | Yes (qty-tracked) |
| Serial phones at counter? | Scan before checkout |
| Can we sell without foundation? | No |

- Phase 3b: session activity + Z-report + daily rollup APIs/UI behind `pos_cashier_shell_v2` (ops only; no revenue JE).

- Cashier shell v2 Phases 0�7 landed behind flag (runbook `POS_CASHIER_SHELL_V2.md`); apply migrations 314�315 on deploy.
