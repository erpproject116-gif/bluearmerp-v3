/** Maps app routes to permission_registry codes (must match migration 020). */
export const hrefPermissionCode: Record<string, string> = {
  "/app/inventory/partners": "inventory.partners",
  "/app/inventory/locations": "inventory.locations",
  "/app/inventory/projects": "inventory.projects",
  "/app/inventory/departments": "inventory.departments",
  "/app/inventory/items": "inventory.items",
  "/app/inventory/stock-movements": "inventory.stock_movements",
  "/app/inventory/after-sales/repair-orders": "inventory.after_sales.repair_orders",
  "/app/inventory/after-sales/repair-orders/new": "inventory.after_sales.repair_orders_new",
  "/app/inventory/after-sales/repair-orders/status": "inventory.after_sales.repair_orders_status",
  "/app/inventory/after-sales/register-repair/new": "inventory.after_sales.register_repair_new",
  "/app/inventory/after-sales/register-repair": "inventory.after_sales.register_repair",
  "/app/inventory/after-sales/register-repair/status": "inventory.after_sales.register_repair_status",
  "/app/inventory/after-sales/register-repair/consumption": "inventory.after_sales.register_repair_consumption",
  "/app/quotation/quotations/new": "quotation.quotations_new",
  "/app/quotation/quotations": "quotation.quotations",
  "/app/quotation/quotations/status": "quotation.quotations_status",
  "/app/quotation/quotations/outstanding": "quotation.quotations_outstanding",
  "/app/quotation/tax-mngt/tax-types": "quotation.tax_types",
  "/app/quotation/tax-mngt/currencies": "quotation.currencies",
  "/app/sales-order/sales-orders/new": "sales_order.sales_orders_new",
  "/app/sales-order/sales-orders": "sales_order.sales_orders",
  "/app/sales-order/sales-orders/status": "sales_order.sales_orders_status",
  "/app/sales-order/sales-orders/outstanding": "sales_order.sales_orders_outstanding",
  "/app/sales-order/sales-orders/release": "sales_order.sales_orders_release",
  "/app/sales/sales/new": "sales.sales_new",
  "/app/sales/sales": "sales.sales",
  "/app/sales/sales/status": "sales.sales_status",
  "/app/sales/sales/pre-invoicing": "sales.sales_pre_invoicing",
  "/app/sales/sales/price-batch": "sales.sales_price_batch",
  "/app/finance/official-receipts/new": "finance.official_receipts_new",
  "/app/finance/official-receipts": "finance.official_receipts",
  "/app/finance/reports/ar-by-customer": "finance.reports_ar_by_customer",
  "/app/finance/reports/receipt-status": "finance.reports_receipt_status",
  "/app/crm/dashboard": "crm.dashboard",
  "/app/crm/notifications": "crm.notifications",
  "/app/crm/follow-up-tasks": "crm.follow_up_tasks",
  "/app/crm/pipelines/quotations": "crm.pipelines_quotations",
  "/app/crm/warranty-assets": "crm.warranty_assets",
  "/app/crm/reports/customer-quotations": "crm.reports_customer_quotations",
  "/app/crm/reports/item-demand": "crm.reports_item_demand",
  "/app/crm/reports/conversion": "crm.reports_conversion",
  "/app/crm/reports/low-stock": "crm.reports_low_stock",
  "/app/crm/settings/alert-rules": "crm.settings_alert_rules",
  "/app/activity-logs": "activity_logs.logs",
  "/app/activity-logs/changes": "activity_logs.changes",
  "/app/user-management/users": "user_management.users",
  "/app/user-management/roles": "user_management.roles",
};

export function permissionCodeForHref(href: string): string | undefined {
  if (hrefPermissionCode[href]) return hrefPermissionCode[href];
  const base = href.replace(/\/settings$/, "").replace(/\/new$/, "");
  return hrefPermissionCode[base];
}

export function permissionCodeForModule(moduleId: string): string {
  return moduleId;
}
