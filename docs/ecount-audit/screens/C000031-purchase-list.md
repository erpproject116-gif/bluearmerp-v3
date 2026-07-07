# C000031 — Purchase List (Review Purchases)

**Menu path:** Inv. I → **Purchases** (L0 module tab) → Purchases → Purchase List  
**URL:** `prgId=C000031`, `menuSeq=MENUTREE_000031`  
**Bluearm target:** `/app/finance/supplier-invoices` (Review Purchases header)  
**Audit status:** pass 3 — live crawl Jul 7 2026

## Why this matters for Bluearm

ECount groups **purchase invoices / review purchases** under the Inv. I **Purchases** module tab, not under Acct. I. This validates the `ReviewPurchasesHeaderNav` split in Bluearm.

## L0 module tab

Clicking **Purchases** on the Inv. I bar switches the entire left menu from Setup master data to the purchase workflow tree.

## Left menu under Purchases (L1)

| Section | Programs |
|---------|----------|
| Purchase Request | List, New, Status |
| Purchase Plan | List, New, Status |
| RFQ | List, New, Progress Status, RFQ Status |
| Purchase Order | List, New, Status, Outstanding P/O Status |
| **Purchases** | **Purchase List**, New Purchases, Purchase Status, Change Price-Batch, Payment Status, Discount Status, Pre-Invoicing Status, A/P by Vendor |
| Collective Invoicing | Purchase Invoice List, Purchase Invoice Status |

## L2 status filter pills (list header)

| Pill | Purpose |
|------|---------|
| All | All documents |
| e-Approval | Approval workflow |
| Unconfirmed | Draft / unposted |
| Confirm | Confirmed purchases |

List rows show **Confirm** in the status column (live tenant data Jul 2026).

## L2 list view tab pills (template tabs)

Numbered tabs **1–6** visible above the grid (+ gear for List Tab Settings). These switch saved list column/layout templates — distinct from Option filter pills.

**Applied Template (Option):** BA-Purchase

## Toolbar

New (F2), Email, Change Status, Send, Print, Barcode (Item), e-Approval, Delete Selected, Excel

## Option filter (Default pill)

Date range (Set Manually), Transaction Type, Domestic/Foreign (All/Domestic/Foreign), Location, Project, Customer, Item, Send Status (All/Unsent/Send), Sort by Modified Date, Applied Template

Only **Default** Option pill visible in this tenant.

## New document entry points

| Action | Actual route |
|--------|----------------|
| Toolbar **New (F2)** | Opens **inline New Purchase** quick-entry form in list workspace (Purchase Invoice I template) — includes header fields, line grid, accounting voucher block, **Create Quality Insp. Request** on lines |
| Left menu **New Purchases** | `prgId=E040303` — full dedicated form (see `screens/E040303-new-purchases.md`) |

**Note:** Prior audit assumed F2 = settings-only; this tenant shows **inline form** on F2. Settings submenu may still be reachable via F2 dropdown arrow or List Tab Settings gear.

## Tab pill checklist

- [x] L0 Purchases module tab
- [x] L2 status pills (All / e-Approval / Unconfirmed / Confirm)
- [x] L2 list view tabs (1–6)
- [x] L2 Option Default pill
- [x] F2 inline New Purchase form (pass 3)
- [ ] L2 Option filter pills beyond Default
- [ ] L2/L3 tabs on dedicated New Purchase form (`E040303`)
- [ ] Modal tabs from e-Approval, Excel, etc.

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Status pills on list | **Partial** — payment status filter exists; doc-status pills (e-Approval/Unconfirmed/Confirm) pending |
| List view template tabs 1–6 | Saved column views on supplier invoice list |
| F2 inline quick entry | Modal/drawer quick-create from list |
| Pre-Invoicing Status | GR → invoice reconciliation report |
| Collective Invoicing (Purchase) | Future group invoicing |
| Create QC Request from purchase line | Not wired |
