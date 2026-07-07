# C000030 — Sales List

**Menu path:** Inv. I → **Sales** (L0 module tab) → Sales → Sales List  
**URL:** `prgId=C000030`, `menuSeq=MENUTREE_000030`  
**Tenant alias (live Jul 2026):** `prgId=C000004` — same screen, same pills/toolbar  
**Bluearm target:** `/app/selling/sales` (and related selling routes)  
**Audit status:** pass 2 — tab pills live-confirmed Jul 7 2026

## L0 module tab

Clicking **Sales** switches left menu from Setup/Purchases to the full selling workflow tree.

## Left menu under Sales (L1)

| Section | Programs |
|---------|----------|
| Quotation | List, New, Status, Outstanding Quote Status |
| Sales Order | List, New, Status, Release S/O, Outstanding S/O Status |
| **Sales** | **Sales List**, New Sales (`E040205`), Change Price-Batch, Sales Status, Receipt Status, Discount Status, Pre-Invoicing Status, A/R by Customer, Print Sales Slips |
| Collective Invoicing | Sales Invoice List, Sales Invoice Status |
| Shipping Order | List, New, Status, Pending Shipment Status |
| Shipping | Shipment List, New Shipment, Shipment Status |

## L2 status filter pills (list header)

| Pill | Purpose |
|------|---------|
| All | All documents |
| e-Approval | Approval workflow |
| Unconfirmed | Draft / unposted |
| Confirm | Confirmed sales |

List rows show **Completed** status label in grid (filter pill is **Confirm** — ECount naming mismatch).

**Live crawl (Jul 7 2026):** Status pills, toolbar, and Option Default all confirmed on `C000004`.

## Open existing sale (edit)

Click **Date-No.** column link (not checkbox row select). Example: `07/07/2026 -4` → **Modify Sales** modal with customer MOTOR ACE, item 4964 LENOVO, total 34,850.00, serial PF5HD91T. See `screens/E040205-new-sales.md` pass 4.

## Toolbar

New (F2), Email, Change Status, Send, Print, Barcode (Item), e-Approval, Delete Selected, Excel

## Option filter (Default pill only seen)

Date range, Transaction Type, Currency (All/Domestic/Foreign), Location-Out, Project, Customer, Item, Send Status, Sort by Modified Date, Applied Template

**Note:** Only **Default** Option pill visible in this tenant — additional pills may exist via List Tab Settings.

## New document entry points

| Action | Actual route |
|--------|----------------|
| Toolbar **New (F2)** | Opens **settings submenu** (Search Field Settings, Template Settings, List Tab Settings, etc.) — **not** inline form |
| Left menu **New Sales** | `prgId=E040205` — see `screens/E040205-new-sales.md` |

## Tab pill checklist

- [x] L0 Sales module tab
- [x] L2 status pills (All / e-Approval / Unconfirmed / Confirm)
- [x] L2 Option Default pill
- [ ] L2 Option pills beyond Default (if any)
- [x] L2/L3 tabs on New Sales form (`E040205`) — pass 1 in `screens/E040205-new-sales.md`
- [ ] Modal tabs from e-Approval, Excel, etc.

## Bluearm gaps

| ECount | Bluearm |
|--------|---------|
| Status pills on sales list | **Done** — All / E-Approval / Unconfirmed / Confirm |
| Pre-Invoicing Status (Sales) | SO → invoice reconciliation |
| Collective Invoicing (Sales) | Future group invoicing |
| Shipping Order / Shipment subtree | Partial — verify delivery workflow parity |
