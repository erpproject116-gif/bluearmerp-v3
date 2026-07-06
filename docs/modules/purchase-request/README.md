# Purchase Request module

## Scope

Purchase requests with hybrid header/line partner modeling, legacy progress statuses, lightweight approval workflow, and combined list filter + grid UX.

| Feature | Route | API |
|---------|-------|-----|
| Purchase Request List | `/app/purchase-request/purchase-requests` | `GET /api/v1/purchase-request/purchase-requests` |
| New Purchase Request | `/app/purchase-request/purchase-requests/new` | `POST /api/v1/purchase-request/purchase-requests` |
| Purchase Request Status | `/app/purchase-request/purchase-requests/status` | `GET /api/v1/purchase-request/purchase-requests/status-report` |
| Submit for approval | PR modal / status report | `POST /api/v1/purchase-request/purchase-requests/{id}/submit-for-approval` |
| Approve / Reject | PR modal / status report | `POST .../approve`, `POST .../reject` |
| Print | new tab from grid | `GET /api/v1/purchase-request/purchase-requests/{id}/print` |
| Form settings | `/app/purchase-request/purchase-requests/settings` | `pr_purchase_request` entity |

## Dependencies

- **Inventory** — partners (customers + vendors), items, locations, projects
- **Quotation / Tax Management** — `quo_tax_types`, `quo_currencies`, tax preview API

## Sequences

- Date-No.: editable `date_seq` per `request_date` (unique per tenant + date)
- PR No.: `YYMMDD###` via `purchase_request_no` daily sequence

## Partner model (hybrid)

- Optional header `partner_id` and per-line `partner_id`
- List/filter display: header partner when set, otherwise first line partner
- Customer filter matches header **or** any line partner

## Progress statuses

`unconfirmed`, `e_approval`, `confirmed`, `in_progress`, `completed`

## Lightweight approval (Sprint 4)

```
unconfirmed → (submit) → e_approval → (approve) → confirmed + approved_at
                              └→ (reject) → unconfirmed
```

- Audit rows in `pr_approvals` (`submit`, `approve`, `reject`).
- Permission `purchase_request.approve` (write for store admins) required to approve/reject.
- When **Process Policies → Require PR approval** is enabled, PO conversion requires `confirmed` **and** `approved_at`; manual progress dropdown cannot set `confirmed` directly.

## CRM

Follow-up tasks link via `purchase_request_id` on `crm_follow_up_tasks`. List grid shows `CrmTaskCell` with batch summaries.

## Demo seed

- `scripts/seed-demo-purchase-requests.sql` — 2 demo PRs per tenant
- Golden **S10** in `scripts/seed-demo-golden-scenarios.sql`:
  - `DEMO-S10-PR` — pending (`e_approval`)
  - `DEMO-S10-PR-OK` + `DEMO-S10-PO` — approved with linked PO

Run after migrations `036`–`039`, `053`, and `scripts/seed-demo-inventory.sql`.

## Out of scope (MVP)

- Multi-level BPM / workflow engine
- Email / Send integrations
- Mgmt Field filter (use custom fields later)

PO conversion and goods receipt are implemented (migrations `042`–`044`); see golden scenarios S2/S10.

## Manual test checklist

1. Create PR — save with line vendors; list shows partner name.
2. Submit for approval — status becomes `e_approval`.
3. Approve (store admin) — status `confirmed`, `approved_at` set, audit row written.
4. Reject pending PR — returns to `unconfirmed` with required remarks.
5. Enable **Require PR approval** in Process Policies — PO from PR blocked until approved; manual confirm blocked.
6. Status report — approval column shows actions; CSV export still works.
7. Golden S10 verify script passes after `db reset`.

## Migrations

- `036_purchase_request.sql` — core PR tables
- `053_pr_approvals.sql` — `pr_approvals`, `approved_at`, `purchase_request.approve` permission
