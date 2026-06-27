# Purchase Request module

## Scope

Purchase requests with hybrid header/line partner modeling, legacy progress statuses, and combined list filter + grid UX.

| Feature | Route | API |
|---------|-------|-----|
| Purchase Request List | `/app/purchase-request/purchase-requests` | `GET /api/v1/purchase-request/purchase-requests` |
| New Purchase Request | `/app/purchase-request/purchase-requests/new` | `POST /api/v1/purchase-request/purchase-requests` |
| Purchase Request Status | `/app/purchase-request/purchase-requests/status` | `GET /api/v1/purchase-request/purchase-requests/status-report` |
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

## CRM

Follow-up tasks link via `purchase_request_id` on `crm_follow_up_tasks`. List grid shows `CrmTaskCell` with batch summaries.

## Demo seed

`scripts/seed-demo-purchase-requests.sql` — 2 demo PRs per tenant (DEMO000, BLUEARM) after inventory seed.

Run after migrations `036`–`039` and `scripts/seed-demo-inventory.sql`.

## Out of scope (MVP)

- Purchase Order conversion / populated created slips
- e-Approval workflow engine (status enum only)
- Email / Send / ECOUNT integrations
- Mgmt Field filter (use custom fields later)

## Manual test checklist

1. Create PR with editable date_seq — duplicate `(request_date, date_seq)` returns validation error.
2. Save with header partner empty, lines with vendors — list shows line vendor name.
3. Save with header partner set — list shows header name.
4. List filter F8: date range + customer matches header or line partner.
5. Progress inline edit supports all 5 statuses.
6. Item double-click opens search; partner double-click opens partner modal.
7. Status report line rows + CSV export.
8. Print page renders header + lines.
9. CRM Task creates task with `purchase_request_id`; summary badge on list refresh.
