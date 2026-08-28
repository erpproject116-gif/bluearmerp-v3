# Form Settings registry — all standard fields

**Observed** from `api/internal/platform/formfields/registry.go`.  
`*` = `DefaultRequired: true`. Tenants may override via Form Settings (cog).

Line grids → `02-LINE-COLUMNS.md`. Screens without a registry entry → window files `03`–`08`.

---

## inv_partner — Partners

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| partner_kind | Kind | select | * |
| company_name | Company name | text | * |
| ceo_name | CEO name | text | |
| phone | Phone | text | |
| mobile | Mobile | text | |
| email | Email | text | |
| address | Address | textarea | |
| status | Status | select | * |

Settings: `/app/inventory/partners/settings`

---

## inv_location — Locations

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| location_name | Location name | text | * |
| location_type | Type | select | * |
| production_process | Production process | select | * |
| status | Status | select | * |

Settings: `/app/inventory/locations/settings`

---

## inv_project — Projects

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| project_name | Project name | text | * |
| status | Status | select | * |

---

## inv_department — Departments

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| department_name | Department name | text | * |
| status | Status | select | * |

---

## inv_item — Items

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| item_name | Item name | text | * |
| purchase_price | Purchase price | number | |
| sales_price | Sales price | number | |
| vip_price | VIP price | number | |
| warranty_duration_months | Warranty (months) | number | |
| reorder_level | Reorder level | number | |
| track_inventory_qty | Track inventory quantity | checkbox | |
| status | Status | select | * |

**Not in registry (Qty tab — Observed in UI/API):** `track_serial` XOR `track_lot`, serial/lot capture `optional|required`. These still gate GR/sales capture.

Settings: `/app/inventory/items/settings`

---

## inv_repair_order — Repair Orders

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| order_date | Date | date | * |
| partner_id | Customer | select | * |
| pic_name | PIC | text | |
| location_id | Location | select | * |
| progress_status | Progress status | select | |
| scheduled_completion_date | Scheduled completion date | date | |
| latest_update | Latest update | textarea | |
| repair_details | Repair details | textarea | |
| project_id | Project | select | |
| project_name | Project name | text | |
| technician_name | Technician | text | |

Statuses (doc): `received|diagnosing|repairing|awaiting_parts|finished|released`  
Settings: `/app/after-sales/repair-orders/settings`

---

## quo_tax_type — Tax types

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| name | Name | text | * |
| tax_mode | Tax mode | select | * |
| rate_percent | Rate % | number | |
| status | Status | select | * |

---

## quo_currency — Currencies

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| currency_code | Code | text | * |
| name | Name | text | * |
| symbol | Currency sign | text | * |
| status | Status | select | * |

---

## quo_quotation — Quotations

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| order_date | Date | date | * |
| partner_id | Customer | select | * |
| location_id | Location-Out | select | * |
| tax_type_id | Transaction type | select | * |
| currency_id | Currency | select | * |
| pic_name | PIC | text | |
| quotation_validity_text | Quotation validity | text | |
| payment_terms | Payment terms | text | |
| note_for_pic_only | Note for PIC only | textarea | |
| notes | Notes | textarea | |
| project_id | Project | select | |
| progress_status | Progress status | select | |

Lines: `quo_quotation.lines` → `02-LINE-COLUMNS.md`  
Statuses: `progress_status` unconfirmed→in_progress→completed; `voucher_status` none/partial/completed  
Path: `/app/quotation/quotations`

---

## so_sales_order — Sales orders

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| order_date | Date | date | * |
| due_date | Due date | date | |
| delivery_date | Delivery date | date | |
| partner_id | Customer | select | * |
| location_id | Location-Out | select | * |
| tax_type_id | Transaction type | select | * |
| currency_id | Currency | select | * |
| pic_name | PIC | text | |
| reference | Reference | text | |
| notes | Notes | textarea | |
| delivery_remarks | Delivery remarks | textarea | |
| payment_terms | Payment terms | text | |
| mop | MOP | text | |
| project_id | Project | select | |
| progress_status | Progress status | select | |

Lines: `so_sales_order.lines`  
Path: `/app/sales-order/sales-orders`

---

## sa_sales — Sales invoices

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| order_date | Date | date | * |
| due_date | Due date | date | |
| partner_id | Customer | select | * |
| location_id | Location | select | * |
| tax_type_id | Transaction type | select | * |
| currency_id | Currency | select | * |
| pic_name | PIC | text | |
| si_dr_no | SI/DR No. | text | |
| payment_terms | Payment terms | text | |
| notes | Notes | textarea | |
| project_id | Project | select | |
| progress_status | Progress status | select | |

Lines: `sa_sales.lines` (includes discount, serial/lot)  
Path: `/app/sales/sales`

---

## pr_purchase_request — Purchase requests

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| request_date | Date | date | * |
| partner_id | Supplier | select | |
| location_id | Location | select | * |
| tax_type_id | Transaction type | select | * |
| currency_id | Currency | select | * |
| pic_name | PIC | text | |
| reference_no | Reference | text | |
| notes | Notes | textarea | |
| project_id | Project | select | |

Lines: `pr_purchase_request.lines`  
Path: `/app/purchase-request/purchase-requests`

---

## po_purchase_order — Purchase orders

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| order_date | Date | date | * |
| partner_id | Vendor / Supplier | select | * |
| location_id | Location | select | * |
| tax_type_id | Transaction type | select | * |
| currency_id | Currency | select | * |
| pic_name | PIC | text | |
| reference | Reference | text | |
| notes | Notes | textarea | |
| project_id | Project | select | |

Lines: `po_purchase_order.lines` (includes UoM, unit price, serials, optional warranty)  
Path: `/app/purchase-order/purchase-orders`

---

## gr_goods_receipt — Goods receipt

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| receipt_date | Receipt date | date | * |
| location_id | Location | select | * |
| reference | Reference | text | |
| notes | Notes | textarea | |

PO link + lines + serial/lot capture are UI/API (not all in registry).  
Path: `/app/purchases/purchase-receive`

---

## fin_official_receipt — Official receipts

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| receipt_date | Date | date | * |
| partner_id | Customer | select | * |
| currency_id | Currency | select | * |
| payment_method | Payment method | select | * |
| reference_no | Reference no. | text | |
| notes | Notes | textarea | |

Applications: ≥1 SI line (sales_id + amount). No stock.  
Path: `/app/finance/official-receipts`

---

## fin_supplier_invoice — Supplier invoices

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| invoice_date | Invoice date | date | * |
| partner_id | Vendor | select | * |
| tax_type_id | Transaction type | select | * |
| currency_id | Currency | select | * |
| location_id | Location | select | * |
| pic_name | PIC | text | |
| progress_status | Progress status | select | |
| due_date | Due date | date | |
| payment_terms | Payment terms | text | |
| vendor_invoice_no | Vendor invoice no. | text | |
| reference | Reference | text | |
| project_id | Project | select | |
| notes | Notes | textarea | |

Lines: `fin_supplier_invoice.lines` · List: `fin_supplier_invoice.list`  
No stock on SI (GR already did).

---

## ops_work_item — Operations work items

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| title | Title | text | * |
| column_id | Column | select | * |
| status | Status | select | * |
| priority | Priority | select | * |
| partner_id | Customer | select | |
| start_date | Start date | date | |
| end_date | End date | date | |
| description | Description | textarea | |

Settings: `/app/operations/work-items/settings`  
Doc statuses often: open / in_progress / done / blocked (board columns vary by pack).

---

## hr_employee — Employees

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| employee_no | Employee # | text | * |
| full_name | Full name | text | * |
| department_id | Department | select | |
| job_title | Job title | text | |
| hire_date | Hire date | date | * |
| status | Status | select | * |
| base_salary | Base salary | number | |
| user_id | ESS login user | select | |
| email | Email | text | |
| bank_name | Bank name | text | |
| bank_account_no | Bank account no. | text | |
| tin | TIN | text | |
| sss_no | SSS no. | text | |
| philhealth_no | PhilHealth no. | text | |
| pagibig_no | Pag-IBIG no. | text | |
| tax_status | Tax status | select | |
| notes | Notes | textarea | |

Settings: `/app/hr/employees/settings`  
Statuses (doc): active | inactive | terminated

**Note:** Custom-fields allow-list may omit `hr_employee` while Form Settings still works — verify if adding custom fields to HR.

---

## cms_page — CMS pages

| Field | Label | Type | Default req |
|-------|-------|------|-------------|
| title | Title | text | * |
| topic | Topic cluster | text | |
| slug | Slug | text | |
| body | Body | textarea | |
| seo_title | SEO title | text | |
| seo_description | SEO description | textarea | |
| featured_media_id | Featured image | select | |
| lang | Language | text | |
| focus_phrase | Focus phrase | text | |
| visibility | Visibility | select | |
| status | Status | select | |

Settings: `/app/cms/pages/settings`

---

## Entities with drafts but **no** Form Settings registry

These appear in `DRAFT_ENTITY` / CRM constants — fields live in modals/API only:

`fin_journal_entry`, `fin_payment_voucher`, `inv_stock_adjustment`, `so_delivery_receipt`, `pos_order_ui`, `crm_lead`, `crm_opportunity`, `crm_follow_up_task`, `crm_alert_rule`, `crm_warranty_asset`, `support_ticket`, `mfg_work_order`, `mfg_bom`, `qa_ncr`, `qa_capa`, `fixed_asset`, `hr_remittance`, `hr_attendance`, …

See window files `05`–`08` for known fields.
