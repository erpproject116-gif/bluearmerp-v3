# Branch overview audit — store-admin Active branch

Evidence-based audit of Active-branch / store-admin isolation on overview and list surfaces.
Taxonomy, wiring matrix (Phase 1), QA protocol (Phase 2). **Preferred live audit: Phase 2 in the browser (no tokens).** Engineer-only token smoke script is optional and skippable.

Related: `USER_ACTIONS_BRANCH_ISOLATION.md`.

## Taxonomy (mandatory)

| Class | Name | Meaning |
|-------|------|---------|
| **A** | Config | Job missing `apply_user_scopes`, empty `user_data_scopes`, or isolation off when hard fence expected |
| **B** | Known gap | Company-wide by design, or no `location_id` / no datascope path |
| **C** | List leak | `X-Branch-ID` present; API returns foreign-branch rows when scopes should apply |
| **D** | Cache/UX | API correct; UI stale until refresh / queryKey omits branch |
| **E** | Deep link | List OK; GET-by-id opens other-branch doc |
| **F** | Null location | Legacy docs with null `location_id` appear/disappear oddly |

## How store-admin filtering actually works

Observed-in-repo (`api/internal/platform/auth/datascope/filter.go`, `branchiso.go`):

1. **Owner / platform / support** (`CanViewAllBranchCommercial`): `ApplyActiveBranchViewSQL` when `X-Branch-ID` set — independent of isolation.
2. **Store admin (and other non–view-all)** with `apply_user_scopes = true`: filter to `user_data_scopes` locations; then `ResolveLocationFilter` further narrows to Active branch when header set.
3. **Store admin** with `apply_user_scopes = false`: no scope IN-list; Active branch view-scope does **not** apply. Hard fence only if `strict_branch_isolation` via `ApplyCommercialLocationSQL`.
4. **Fail closed**: `apply_user_scopes` on + zero scope rows → `and 1=0` (sees nothing).

**Gate before Class C:** confirm scopes + (`apply_user_scopes` OR isolation on) for the test user.

---

## Phase 1 — Module wiring matrix

“Overview” hubs (`DocAreaOverviewPage`) are nav cards only — they do not fetch business lists. Audit the **list / report APIs** linked from each area.

| Module | App routes (primary) | List / report API | Datascope wired? | Owner Active-branch view? | Notes / suspected class |
|--------|----------------------|-------------------|------------------|---------------------------|-------------------------|
| Quotation | `/app/quotation`, `/app/quotation/quotations` | `GET /api/v1/quotations` | **Yes** — `ApplyUserScopesSQL` (`q.location_id`, partner) | Yes (via same helper) | Commercial baseline. FE `queryKey: ["quotations", p]` — no branch id → Class **D** risk mitigated by switcher `invalidateQueries()` |
| SO | `/app/sales-order`, `/app/sales-order/sales-orders` | `GET /api/v1/sales-orders` | **Yes** — `so.location_id` | Yes | Same pattern as quotation |
| Sales | `/app/sales`, `/app/sales/sales` | `GET /api/v1/sales` | **Yes** — `s.location_id` | Yes | Same |
| Purchase Request | `/app/purchase-request`, PR hub | `GET /api/v1/purchase-requests` | **Yes** — `pr.location_id` | Yes | Same |
| Purchase Order | `/app/purchase-order`, PO hub | `GET /api/v1/purchase-orders` | **Yes** — `po.location_id` | Yes | Same |
| Purchases (SI / receive) | `/app/purchases/purchase-receive` | `GET /api/v1/finance/supplier-invoices` | **Yes** — `si.location_id` | Yes | Same |
| RFQ | `/app/rfq`, `/app/rfq/...` list | `GET` RFQ list (`purchaseorder/rfq.go` `listRFQs`) | **Yes** — `ApplyUserScopesSQL` on `r.location_id` (migration `316_rfq_location_id.sql`) | Yes | Create/from-PR sets `location_id` (PR / Active branch / home). Legacy null locs may hide under Active branch (Class F) |
| Serial | `/app/inventory/serial-lot/registry` | `GET .../serial-units` (+ available) | **Yes** — datascope in `serial.go` | Yes | FE `["serial-units", p]` — no branch in key |
| Lot no | `/app/inventory/serial-lot/lots` | `GET .../lot-batches` | **Yes** — datascope | Yes | Same |
| Inventory — stock balance | `/app/inventory/reports/stock-balance` | `GET .../reports/stock-balance` | **Yes** — `bal.location_id` | Yes | Narrows with Active branch when scoped / view-all |
| Inventory — stock ledger | `/app/inventory/reports/stock-ledger` | `GET .../reports/stock-ledger` | **Yes** — `ApplyUserScopesSQL` on `sm.location_id` | Yes | Same pattern as stock-balance |
| Inventory — stock ageing | `/app/inventory/reports/stock-ageing` | `GET .../reports/stock-ageing` | **Yes** — `ApplyUserScopesSQL` on `bal.location_id` | Yes | Same |
| Inventory — on-hand | `/app/inventory/reports/on-hand` | `GET .../reports/on-hand` | **Yes** — `ApplyUserScopesSQL` on `l.id` | Yes | Same |
| Inventory — inv book | `/app/inventory/reports/inv-book` | `GET .../reports/inv-book` | **Yes** — `ApplyUserScopesSQL` on `l.id` | Yes | Same |
| Inventory — status / find stock | `/app/inventory/find-stock`, `.../inventory-status` | `GET .../reports/inventory-status` | **Yes** — `ApplyUserScopesSQL` (list/export + matrix expand) | Yes | Matrix catalog still uses explicit `location_id` for company-available filters when provided |
| Accounting — SI/OR/PV lists | Finance routes | SI/OR/PV list handlers | **Yes** (SI, OR, PV) | Yes | Aging reports also wired |
| Accounting — AR/AP aging | Finance reports | aging handlers | **Yes** | Yes | |
| Bookkeeping / GL reports | TB, P&L, BS, GL, cash flow | `finance/financial_reports.go` etc. | **N/A — company-wide** | N/A | Class **B** by design; FE honesty banner when branch selected |
| Journal | `/app/finance/acct-i/journal-entries` | `GET .../journal-entries` | **No** — no `location_id` on JE | N/A | Class **B**; residual epic in isolation runbook |

### FE Class D notes (observed)

- `BusinessBranchSwitcher` calls `queryClient.invalidateQueries()` on branch change (broad invalidate) + soft navigate — reduces stale UI risk.
- Most list hooks (`useQuotationList`, `useSalesOrderList`, `useSalesList`, `usePurchaseOrderList`, `usePurchaseRequestList`, `useSupplierInvoiceList`, `useSerialLotList`, report hooks in `useModuleReports`) **omit active branch from `queryKey`**. If invalidate ever fails or a fetch races before header updates, Class **D** is possible.
- `rfq-list` queryKey is static `["rfq-list"]` — irrelevant until API gains location scope.

### Related APIs (not in user list but same pattern)

| Area | Wired? |
|------|--------|
| Goods receipts, delivery receipts | Yes (`ApplyUserScopesSQL`) |
| Sales/quotation/PO/PR status reports | Yes |
| Shipping SO picker, WO↔SO link | Yes |
| CRM / some manufacturing pickers | Audit if leaks appear (runbook residual) |

---

## Phase 2 — Manual QA protocol

### Preconditions (record once per session)

```text
Env: ____________________  Build/SHA: ____________________
Tenant ID: ______________  Isolation on? Y/N ______________
User email: _____________  Role: __________________________
apply_user_scopes? Y/N __  home_location_id: ______________
Allowed location ids: _____________________________________
Fixture: HQ doc nos _____________  Branch1 doc nos _____________
```

SQL helpers:

```sql
select tenant_id, strict_branch_isolation from tenant_process_policies where tenant_id = :tid;

select u.email, u.tenant_role, u.home_location_id, tr.apply_user_scopes
from users u
join tenant_roles tr on tr.tenant_id = u.tenant_id and tr.role_code = u.tenant_role
where u.email = :email;

select scope_type, record_id from user_data_scopes where user_id = :uid;
```

### Steps (per screen)

1. Sign in as **store admin** (not owner).
2. Set Active branch = Branch 1 (in allowed set).
3. Open the list/report route; hard refresh once.
4. DevTools → Network → list request: copy path, confirm `X-Branch-ID`, note `total` / first ids / location fields.
5. Switch Active branch (only if allowed) or clear expectation if single-scope; repeat capture.
6. Optional Class E: open known HQ doc by URL.
7. Classify A–F; attach screenshot + HAR snippet.

### Pass criteria (commercial lists)

When scopes assigned **and** (`apply_user_scopes` **or** `strict_branch_isolation`):

- With Active branch = Branch 1, list must not include docs whose `location_id` is only HQ (except Class F nulls — note separately).
- `X-Branch-ID` must equal Branch 1 on the list request.
- Journal / TB / P&L / BS / GL / cash flow: **do not** fail for company-wide data (Class B expected).
- RFQ: expect tenant-wide until schema/handler gain location (Class B).

### Evidence log template

| Date | Env | User | Role | Scopes | Isolation | Route | ActiveBranch | Request path | X-Branch-ID | Total | Foreign docs? | Class | Evidence |
|------|-----|------|------|--------|-----------|-------|--------------|--------------|-------------|-------|---------------|-------|----------|
| | | | | | | | | | | | | | |

Copy rows as needed. Prefer one row per route × branch setting.

### Suggested smoke order (30–45 min)

1. Quotation list → SO → Sales → PR → PO → Purchases (SI)  
2. Serial registry → Lot batches  
3. Stock balance → Inventory status (find stock) → Inv book  
4. RFQ list (expect B)  
5. Journal + P&L (expect B)  
6. One Class E deep link on SO or Quotation  

---

## Prioritized Class C/D suspects (fix next — after evidence)

Do **not** blanket-fix. Use this queue when Phase 2 proves headers + unexpected rows.

| Priority | Suspect | Why | Likely class if proven |
|----------|---------|-----|-------------------------|
| **P0** | Store-admin **config** | `apply_user_scopes` off + isolation off → company-wide on wired lists looks like a bug | **A** first |
| **P1** | **RFQ** list | Was unwired; now has `location_id` + datascope — retest after migration `316` | Was **B**, now expect Pass |
| **P1** | **Journal / books** | No location on JE; GL company-wide | **B** (do not “fix” with fake branch books) |
| **P2** | Inventory **ledger / ageing / on-hand / inv-book / inventory-status** | Datascope wired — retest in browser | Was **B**, now expect Pass |
| **P3** | Commercial lists (Q/SO/Sales/PR/PO/SI) if Class C with scopes on | Shared datascope should work — check null `location_id`, wrong column, or session without `ApplyUserScopes` flag | **C** / **F** |
| **P4** | FE queryKeys omit branch | Broad invalidate usually OK; if stale after switch without refresh | **D** — add branch id to keys |
| **P5** | GET-by-id opens HQ while list filtered | v1 design for owners; for store_admin verify assert helpers | **E** |

---

## Phase 3 — Prefer browser (no tokens)

**Primary path for product/QA:** use **Phase 2** only. Sign in as store admin in the app, switch Active branch, open each list, and log Network evidence. You never copy JWTs.

### Browser checklist (no token handling)

1. Log in as the store admin under test.
2. Confirm Access scopes + job “Limit to assigned branches” (or isolation on) — Class A gate.
3. Set Active branch in the sidebar.
4. Open each list/report from the matrix.
5. DevTools → Network → the list request:
   - Confirm **`X-Branch-ID`** matches the Active branch.
   - Note **total** / sample doc nos; check whether foreign-branch docs appear.
6. Fill one evidence-table row per screen (Phase 2 template above).
7. Classify A–F using the taxonomy.

That is enough for a thorough, accurate audit.

### Engineer-only optional script (tokens required — skip if you don’t want them)

`scripts/branch-overview-audit.mjs` automates the same list calls outside the browser. It needs a pasted session JWT. **Do not use this for normal QA** if you prefer not to handle tokens. Leave it for backend/CI engineers only.

### Still optional (not built)

- **(a)** In-app Branch Audit strip (uses your normal login — no token paste)
- **(b)** Sampled structured server logs on list handlers

Do **not** implement fake branch GL.

---

## Confidence

| Item | Basis |
|------|--------|
| Wiring Yes/No in matrix | Observed-in-repo handler calls / RFQ schema / JE list SQL |
| Store-admin vs owner behavior | Observed-in-repo `ApplyUserScopesSQL` / `ApplyActiveBranchViewSQL` |
| Live Pass/Fail per tenant | **Phase 2 in the browser** (no token script required) |
| Token smoke script | Optional engineer tool only |
