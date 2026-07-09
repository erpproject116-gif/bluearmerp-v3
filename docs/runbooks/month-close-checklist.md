# Month-close checklist (pilot)

Use this at **month-end** before finance signs off. Most steps are in-app; tick each box in your pilot tracker.

## Week before close

- [ ] **Pre-invoicing (sales)** — Sales → Pre-Invoicing Status: bill all delivered/released SO lines you intend to recognize this month.
- [ ] **Pre-invoicing (purchases)** — Buying → Pre-Invoicing Status: confirm GR lines waiting for supplier invoices.
- [ ] **Open documents** — Complete or cancel draft quotations, SOs, POs, and PRs that should not roll into next month.
- [ ] **Attachments** — Confirm required attachments on confirmed quotes, SOs, sales, POs, and purchases (Process policies).

## Sales & AR

- [ ] All **sales invoices** for the period saved with correct progress status.
- [ ] **Invoice tab** reviewed on each material sale: line breakdown, Acct I/II, fees, remark.
- [ ] **Draft journal entries** for sales invoices reviewed; post or enable auto-post (`accounts_auto_post_sales`) per policy.
- [ ] **Official receipts** recorded for collections; applications match invoice balances.
- [ ] **Receivable Status** / **A/R by Customer** as-of last day of month — export CSV for files.

## Purchasing & AP

- [ ] **Goods receipts** posted for physical receipts in the period.
- [ ] **Supplier invoices** created from GR/PO load slips; Invoice tab reviewed.
- [ ] **Draft purchase journals** reviewed; post or enable `accounts_auto_post_purchase`.
- [ ] **Payment vouchers** for vendor payments in the period; partial payments show correct balance.
- [ ] **Payable Status** / **A/P by Vendor** as-of month-end — export CSV.

## GL & reconciliation

- [ ] **Bank reconciliation** — Finance → Bank Reconciliation: match statement lines to OR/PV for the month.
- [ ] **Trial Balance** — no unexpected draft-only accounts blocking close.
- [ ] **Acct vs Inventory** — investigate variances before signing inventory valuation.
- [ ] **Stock reconciliation** — clear red flags (serial mismatch, GR without SI, etc.).

## Sign-off

- [ ] Finance lead confirms TB / P&L / Balance Sheet for the period.
- [ ] `/health/schema` healthy on production (no pending migrations).
- [ ] Golden path smoke passes against production API (optional but recommended).

## Related docs

- [Deploy checklist](./deploy-checklist.md)
- KB: **Cash In and accounting after saving a sales invoice**
- KB: **Journal entries: draft → review → post**
- [`docs/modules/finance/README.md`](../modules/finance/README.md)
