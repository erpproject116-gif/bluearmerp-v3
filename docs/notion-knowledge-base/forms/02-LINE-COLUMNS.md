# Line & list column catalogs

**Observed** from `api/internal/platform/columnlabels/registry.go`.  
Tenants can hide/relabel columns; `DefaultHidden` columns start off until enabled.

These are **line grid / list headers**, not the same as Form Settings requiredness. Qty/price validation is still enforced in domain APIs.

---

## quo_quotation.lines

| Column | Label |
|--------|-------|
| line_no | # |
| item_code | Item Code |
| item_name | Item Name |
| description | Description |
| qty | Qty |
| basis | Basis |
| unit_price | Unit Price |
| unit_non_vat | Unit (Non-VAT) |
| non_vat_total | Non-VAT Total |
| tax | Tax |
| unit_vat_inc | Unit (VAT inc.) |
| line_total | Line Total |
| serials | Planned Serials |
| remark | Remark |

---

## so_sales_order.lines

| Column | Label |
|--------|-------|
| line_no | # |
| item_code | Item Code |
| item_name | Item Name |
| description | Description |
| qty | Qty |
| basis | Basis |
| unit_non_vat | Unit (Non-VAT) |
| non_vat_total | Non-VAT Total |
| tax | Tax |
| unit_vat_inc | Unit (VAT inc.) |
| line_total | Line Total |
| remark | Remark |

---

## sa_sales.lines

| Column | Label |
|--------|-------|
| line_no | # |
| item_code | Item Code |
| item_name | Item Name |
| description | Description |
| qty | Qty |
| basis | Basis |
| unit_non_vat | Unit (Non-VAT) |
| non_vat_total | Non-VAT Total |
| tax | Tax |
| unit_vat_inc | Unit (VAT inc.) |
| discount_amount | Discount |
| serials | Serial / Lot |
| line_total | Line Total |
| remark | Remark |

---

## pr_purchase_request.lines

Same shape as SO lines (no unit_price / serials columns in registry).

| Column | Label |
|--------|-------|
| line_no | # |
| item_code | Item Code |
| item_name | Item Name |
| description | Description |
| qty | Qty |
| basis | Basis |
| unit_non_vat | Unit (Non-VAT) |
| non_vat_total | Non-VAT Total |
| tax | Tax |
| unit_vat_inc | Unit (VAT inc.) |
| line_total | Line Total |
| remark | Remark |

---

## po_purchase_order.lines

| Column | Label | Notes |
|--------|-------|-------|
| line_no | # | |
| item_code | Item Code | |
| item_name | Item Name | |
| spec_name | Spec Name | |
| description | Description | |
| qty | Qty | |
| unit | UoM | |
| basis | Basis | |
| unit_price | Unit Price | |
| unit_non_vat | Unit (Non-VAT) | |
| non_vat_total | Non-VAT Total | |
| tax | Tax | |
| unit_vat_inc | Unit (VAT inc.) | |
| line_total | Line Total | |
| warranty | Warranty | **DefaultHidden** |
| serials | Serials | |
| remark | Remark | |

---

## fin_supplier_invoice.lines

Same as PO lines (incl. UoM, unit_price, warranty DefaultHidden, serials).

---

## fin_supplier_invoice.list (list table)

| Column | Label |
|--------|-------|
| date_no_display | Date-No. |
| vendor_invoice_no | SI/DR No. (Tracking No.) |
| po_numbers | PO Number |
| notes | Notes |
| payment_terms | Payment Terms |
| tax_type_name | Transaction Type Name |
| vendor_name | Customer/Vendor Name |
| item_name_summary | Item Name (Summary) |
| grand_total | Total Amount |
| progress_status | Progress Status |
| invoicing_status | Invoicing Status |
| print | Print |
| created_by_name | Creator |
| pic_name | PIC Name |
| history | History |
| lifecycle | Manage |

---

## Not in columnlabels registry

GR lines, OR applications, PV applications, JE lines, Stock Entry/Adjustment lines, POS cart, CRM forms — columns/fields are UI-local; see window files.
