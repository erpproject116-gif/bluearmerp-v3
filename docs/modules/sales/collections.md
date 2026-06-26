# Sales collections

Sales-module navigation for collection reports and receipt journal workflows. APIs remain under `/api/v1/finance` and `/api/v1/sales` as noted below.

## Features

| Feature | Web route | Permission | API |
|---------|-----------|------------|-----|
| Official Receipt Status | `/app/sales/reports/official-receipt-status` | `sales.official_receipt_status` | `GET /api/v1/finance/official-receipt-status` |
| SI Receipt Status | `/app/sales/reports/si-receipt-status` | `sales.si_receipt_status` | `GET /api/v1/finance/receipt-status` |
| A/R by Customer | `/app/sales/reports/ar-by-customer` | `sales.ar_by_customer` | `GET /api/v1/finance/ar-by-customer` |
| Sales Discount Status | `/app/sales/reports/discount-status` | `sales.sales_discount_status` | `GET /api/v1/sales/discount-status-report` |
| Report templates API | `/api/v1/report-templates?report_key=…` | same permission as parent report | `GET/PUT/DELETE /api/v1/report-templates`, logo upload |
| Print Sales Slips | `/app/sales/reports/print-slips` | `sales.print_sales_slips` | `GET /api/v1/sales/print-batch` |

Click **Date-No.** on Official Receipt Status to open the **Receipt Journal** modal (journal lines, bank accounts, receivable applications, attachments).

Finance module retains equivalent reports (SI Receipt Status renamed from “Receipt Status”).

## Migrations

- `028_finance_receipt_journal.sql` — OR dimensions, bank accounts, GL picklist, journal lines, attachments, `sa_sales.department_id`
- `029_sales_collections_permissions.sql` — sales report permissions
- `030_report_templates.sql` — tenant-saved report templates (`sales_discount_status`)
- `031_report_template_assets.sql` — report logo assets + extended `report_key` values

## Manual test checklist

1. Apply migrations `028` and `029`; restart API.
2. Official Receipt Status — all eight filters; CSV export; Date-No. opens journal.
3. Receipt Journal — bank search/register, journal lines, receivable apply, save; activity log on save.
4. SI Receipt Status — unchanged data, new label.
5. A/R by Customer — location/department/project/PIC filters.
6. Sales Discount Status — header-level rows with discounts; **Applied Template** presets (Default, With Apvl. Line, Graph View, Apvl. Line + Graph); Apvl. Line shows discounted line numbers; 2-level sort and subtotals; demo discount in `seed-demo-sales.sql`.
7. Print Sales Slips — batch print from Sales Status filters.
