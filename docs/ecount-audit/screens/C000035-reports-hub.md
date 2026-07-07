# C000035 — Reports hub

**Menu path:** Inv. I → **Reports** (L0 module tab)  
**URL:** `prgId=C000035`, `menuSeq=MENUTREE_000035`  
**Bluearm target:** `/app/reports`  
**Audit status:** Inv. I Reports subtree depth-audited passes 5–14; Inv. Movement auth-blocked pass 12 — see linked screen docs under `screens/`

## Layout

Reports opens a **two-pane hub**: left category tree + right quick-launch grid of report links. Toolbar: **Update Balance for Inventory**.

## Left menu categories (L1)

| Category | Example reports |
|----------|-----------------|
| Communication Center | Message Log (`E010851` → **Msg.** inbox), Sent Doc. History (`E010858`) — see `inv1-reports-communication-proof.md` |
| Proof Center | Proof Center (`E040730`) — attach receipts / e-Sign — see `inv1-reports-communication-proof.md` |
| Inventory Balance | Balance, by Location, by Item Relation, by Multi Spec., by BOM, Aging, Inv. Book, Change History, Daily Report |
| Sales | Sales/Quote/SO/Shipping statuses, A/R, Receipt, Discount, Pre-Invoicing, Sales Invoice Status, Monthly Receivable Change |
| Purchases | Purchase/PR/Plan/PO statuses, A/P, Payment, Discount, Pre-Invoicing, Purchase Invoice Status, Monthly Payable Fluctuation |
| Production/Outsourcing | J/O, Goods Issued, Job Record, Goods Receipt statuses |
| Inv. Movement | Location Tran., Internal Use, Product Defect, Disassemble, Disposal, Defect Rate, Inv. Count, Inv. Adjustment |
| Others | Daily Costing/Profit, AR/AP Status, Customer/Vendor Books I & II, Sales/Purchases Summary, Price Change History, Management Report, All-In-One I/II, Status Grand Total, View Transaction History |

## Tab pills

Hub screen has **no document status pills**. Each opened report may have its own Option filter pills — audit per report when prioritized.

## Bluearm gaps

High-value reports to map first:

- Inventory Balance / by Location → stock on hand reports
- Outstanding S/O and P/O Status → open order dashboards
- Pre-Invoicing Status (Sales/Purchases) → invoice readiness
- Inv. Book / Change History → stock ledger
- A/R by Customer / A/P by Vendor → partner aging
