# C000654 / E041003 — Register Online Store (Setup)

**Menu path:** Inv. I → **Online Store Mgmt** → Setup → **Online Store Mgmt/Register Item Settings**  
**URLs:** Hub `prgId=C000654` · Live program `E041003` (`menuSeq=MENUTREE_002575`)  
**Bluearm target:** — (e-commerce integration; low priority)  
**Audit status:** pass 2 — live crawl Jul 7 2026

> Site Map label says "Register Item Settings"; live page title is **Register Online Store** (store connector registry, not per-item settings).

## Left menu (L1)

| Section | Programs |
|---------|----------|
| Setup | **Register Online Store** `E041003` · **Link to Online Store Item Code** `E041004` |
| Order Mgmt | see `screens/C000654-online-store-orders.md` |

## Register Online Store list (`E041003`)

**List columns:** Online Store Code · Online Store Name · ID · Customer/Vendor Name · Online Store Category · Usage Status

**L2 status pills:** All · e-Approval · Unconfirmed · Confirm (same pattern as Sales/Purchase lists)

**Option filter (Default / All):** Online Store Code/Name · Type (All / Online Store / Integrated Management Solution) · Online Store Type · Customer · ID · Usage Status (All/Use/Deactivate) · Sort by Modified Date

**Toolbar:** Search (F3), Option, Help, **New (F2)**, Provided Features by Online Store

**Empty state:** No rows in BLUEARM tenant.

### New Online Store form (F2 modal)

| Field | Notes |
|-------|-------|
| Online Store Code | |
| Online Store Name | |
| Type | Online Store (default) |
| Online Store Type | Marketplace/channel picker |
| Customer | Linked AR customer |
| Actions | Save/Search (F8) |

---

## Link to Online Store Item Code (`E041004`)

**prgId:** `E041004`, `menuSeq=MENUTREE_002576`

**Tenant observation:** Screen body **does not render** when no online stores are registered (empty content area after navigation). Requires at least one `E041003` store before item-code mapping UI loads.

Expected purpose: map marketplace SKUs to ERP item codes (pairs with Order Mgmt **Item Mapping** toolbar).

## Bluearm

No current parity target — note for future marketplace connector work.