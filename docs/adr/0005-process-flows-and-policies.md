# ADR 0005 — Process flows and tenant policies

## Status

Accepted (2026-06)

## Context

Stakeholder process flows (purchase, sales, inventory) differ by tenant maturity. Some sites require strict gates (PR approval, GR before AP, DR before SI); others need skip-friendly defaults so operators can move fast during rollout.

Bluearm ERP v3 stores per-tenant flags in `tenant_process_policies` (migration `051`) and exposes them in **User Management → Process Policies**.

## Decision

### Policy-driven gates (skip-friendly defaults)

| Policy | Default | When enabled |
|--------|---------|--------------|
| `purchase_require_gr_before_supplier_invoice` | `false` | Supplier invoice lines must reference posted GR balance |
| `purchase_require_pr_approval` | `false` | PO from PR requires `approved_at` |
| `sales_require_delivery_receipt` | `false` | Reserved for future strict DR gate |
| `legacy_combined_so_release` | `true` | Release deducts `qty_on_hand` immediately (v2 behavior) |

When `legacy_combined_so_release = false`:

- SO **release** increments `qty_reserved` only (movement `so_reserve`, `qty_delta = 0`).
- **Delivery receipt post** deducts `qty_on_hand` and reduces `qty_reserved` (movement `dr_issue`).
- Sales invoice from SO validates against **delivered − invoiced** balance.

When `legacy_combined_so_release = true` (default):

- Release deducts `qty_on_hand` as today.
- DR is documentary; SI validates against **released − invoiced**.

### Reconciliation

Inventory module exposes list endpoints under `/api/v1/inventory/reconciliation/*` for operational gaps. Business Dashboard aggregates counts in `/api/v1/dashboard/red-flags`.

| Check | Meaning |
|-------|---------|
| `reserve-without-dr` | Released qty not yet on a posted DR |
| `dr-without-invoice` | Delivered qty not yet invoiced |
| `gr-without-supplier-invoice` | Posted GR lines not fully billed |
| `ap-over-application` | Payment applications exceed invoice total |

### Golden demo scenarios

Stable document numbers in `scripts/seed-demo-golden-scenarios.sql` prove end-to-end chains. `scripts/verify-demo-full-chain.sql` runs after seed on `db reset`.

## Consequences

- Production tenants stay on legacy combined release until explicitly switched.
- Split-mode tenants gain audit-friendly reserve → deliver → invoice separation.
- Dashboard and reconciliation APIs give owners visibility without blocking skip paths.
- New policies require migration + `processpolicy` package + UI toggle + README/ADR update.

## References

- Migration `051_tenant_process_policies.sql`
- Migrations `054_stock_reservation.sql`, `055_delivery_receipt.sql`
- `docs/modules/user-management/process-policies` (Process Policies page)
- `scripts/fixtures/demo-scenarios.yaml`
