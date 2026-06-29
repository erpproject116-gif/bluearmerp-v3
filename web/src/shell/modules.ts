import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";
import { COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { SERIAL_LOT_PREFIX } from "./serial-lot-nav";
import { isSubBranchPath } from "./sub-branch-nav";

export { TAX_MNGT_PREFIX, COLLECTIVE_INVOICING_PREFIX, SERIAL_LOT_PREFIX, isSubBranchPath };

export type ModuleFeature = {
  label: string;
  href: string;
  settingsHref: string;
  /** Path prefix for sidebar sub-branch detection (e.g. /app/after-sales). */
  prefix?: string;
  /** Hidden from sales team; requires CRM analytics permission. */
  analyticsOnly?: boolean;
  /** Hidden unless user can manage CRM alert rules. */
  managersOnly?: boolean;
};

export type AppModule = {
  id: string;
  label: string;
  href: string;
  basePath: string;
  features: ModuleFeature[];
  /** Sidebar-only branches (not shown in header feature tabs). */
  subBranches?: ModuleFeature[];
};

/** Sidebar shows modules + sub-branches; header shows module label + feature nav for the active branch. */
export const appModules: AppModule[] = [
  {
    id: "dashboard",
    label: "Business Dashboard",
    href: "/app/dashboard",
    basePath: "/app/dashboard",
    features: [
      { label: "Dashboard", href: "/app/dashboard", settingsHref: "/app/dashboard" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    href: "/app/inventory/partners",
    basePath: "/app/inventory",
    features: [
      { label: "Partners", href: "/app/inventory/partners", settingsHref: "/app/inventory/partners/settings" },
      { label: "Locations", href: "/app/inventory/locations", settingsHref: "/app/inventory/locations/settings" },
      { label: "Projects", href: "/app/inventory/projects", settingsHref: "/app/inventory/projects/settings" },
      { label: "Departments", href: "/app/inventory/departments", settingsHref: "/app/inventory/departments/settings" },
      { label: "Items", href: "/app/inventory/items", settingsHref: "/app/inventory/items/settings" },
      { label: "Stock Movements", href: "/app/inventory/stock-movements", settingsHref: "/app/inventory/stock-movements" },
    ],
    subBranches: [
      {
        label: "Serial & Lot",
        prefix: SERIAL_LOT_PREFIX,
        href: "/app/inventory/serial-lot/registry",
        settingsHref: "/app/inventory/serial-lot/settings",
      },
    ],
  },
  {
    id: "after_sales",
    label: "After-Sales",
    href: "/app/after-sales/repair-orders",
    basePath: "/app/after-sales",
    features: [
      {
        label: "Repair Order List",
        href: "/app/after-sales/repair-orders",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "New Repair Order",
        href: "/app/after-sales/repair-orders/new",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "Repair Order Status",
        href: "/app/after-sales/repair-orders/status",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "New Repair",
        href: "/app/after-sales/register-repair/new",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "Repair List",
        href: "/app/after-sales/register-repair",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "Repair Status",
        href: "/app/after-sales/register-repair/status",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "A/S Consumption",
        href: "/app/after-sales/register-repair/consumption",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
    ],
  },
  {
    id: "quotation",
    label: "Quotation",
    href: "/app/quotation/quotations",
    basePath: "/app/quotation",
    features: [
      { label: "New Quotation", href: "/app/quotation/quotations/new", settingsHref: "/app/quotation/quotations/settings" },
      { label: "Quotation List", href: "/app/quotation/quotations", settingsHref: "/app/quotation/quotations/settings" },
      { label: "Quotation Status", href: "/app/quotation/quotations/status", settingsHref: "/app/quotation/quotations/settings" },
      {
        label: "Outstanding Quote Status",
        href: "/app/quotation/quotations/outstanding",
        settingsHref: "/app/quotation/quotations/settings",
      },
    ],
    subBranches: [
      {
        label: "Tax Management",
        prefix: TAX_MNGT_PREFIX,
        href: "/app/quotation/tax-mngt/tax-types",
        settingsHref: "/app/quotation/tax-mngt/tax-types/settings",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    href: "/app/sales/sales",
    basePath: "/app/sales",
    features: [
      { label: "New Sales", href: "/app/sales/sales/new", settingsHref: "/app/sales/sales/settings" },
      { label: "Sales List", href: "/app/sales/sales", settingsHref: "/app/sales/sales/settings" },
      { label: "Sales Status", href: "/app/sales/sales/status", settingsHref: "/app/sales/sales/settings" },
      {
        label: "Pre-invoicing Status",
        href: "/app/sales/sales/pre-invoicing",
        settingsHref: "/app/sales/sales/settings",
      },
      {
        label: "Change Sales Price-Batch",
        href: "/app/sales/sales/price-batch",
        settingsHref: "/app/sales/sales/settings",
      },
      { label: "Official Receipt Status", href: "/app/sales/reports/official-receipt-status", settingsHref: "/app/sales/sales/settings" },
      { label: "SI Receipt Status", href: "/app/sales/reports/si-receipt-status", settingsHref: "/app/sales/sales/settings" },
      { label: "A/R by Customer", href: "/app/sales/reports/ar-by-customer", settingsHref: "/app/sales/sales/settings" },
      { label: "Sales Discount Status", href: "/app/sales/reports/discount-status", settingsHref: "/app/sales/sales/settings" },
      { label: "Print Sales Slips", href: "/app/sales/reports/print-slips", settingsHref: "/app/sales/sales/settings" },
    ],
    subBranches: [
      {
        label: "Collective Invoicing (Sales)",
        prefix: COLLECTIVE_INVOICING_PREFIX,
        href: "/app/sales/collective-invoicing/list",
        settingsHref: "/app/sales/sales/settings",
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    href: "/app/crm/dashboard",
    basePath: "/app/crm",
    features: [
      { label: "Dashboard", href: "/app/crm/dashboard", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Notifications", href: "/app/crm/notifications", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Follow-up Tasks", href: "/app/crm/follow-up-tasks", settingsHref: "/app/crm/settings/alert-rules" },
      {
        label: "Quotation Pipeline",
        href: "/app/crm/pipelines/quotations",
        settingsHref: "/app/crm/settings/alert-rules",
      },
      { label: "Warranty Registry", href: "/app/crm/warranty-assets", settingsHref: "/app/crm/settings/alert-rules" },
      {
        label: "Customer × Item",
        href: "/app/crm/reports/customer-quotations",
        settingsHref: "/app/crm/settings/alert-rules",
        analyticsOnly: true,
      },
      { label: "Item Demand", href: "/app/crm/reports/item-demand", settingsHref: "/app/crm/settings/alert-rules", analyticsOnly: true },
      { label: "Conversion Funnel", href: "/app/crm/reports/conversion", settingsHref: "/app/crm/settings/alert-rules", analyticsOnly: true },
      { label: "Low Stock", href: "/app/crm/reports/low-stock", settingsHref: "/app/crm/settings/alert-rules", analyticsOnly: true },
      { label: "Alert Rules", href: "/app/crm/settings/alert-rules", settingsHref: "/app/crm/settings/alert-rules", managersOnly: true },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    href: "/app/finance/official-receipts",
    basePath: "/app/finance",
    features: [
      { label: "New Official Receipt", href: "/app/finance/official-receipts/new", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "Official Receipt List", href: "/app/finance/official-receipts", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "A/R by Customer", href: "/app/finance/reports/ar-by-customer", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "SI Receipt Status", href: "/app/finance/reports/receipt-status", settingsHref: "/app/finance/official-receipts/settings" },
    ],
  },
  {
    id: "sales_order",
    label: "Sales Order",
    href: "/app/sales-order/sales-orders",
    basePath: "/app/sales-order",
    features: [
      { label: "New Sales Order", href: "/app/sales-order/sales-orders/new", settingsHref: "/app/sales-order/sales-orders/settings" },
      { label: "Sales Order List", href: "/app/sales-order/sales-orders", settingsHref: "/app/sales-order/sales-orders/settings" },
      { label: "Sales Order Status", href: "/app/sales-order/sales-orders/status", settingsHref: "/app/sales-order/sales-orders/settings" },
      {
        label: "Outstanding SO Status",
        href: "/app/sales-order/sales-orders/outstanding",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      {
        label: "Release Sales Order",
        href: "/app/sales-order/sales-orders/release",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
    ],
  },
  {
    id: "purchase_request",
    label: "Purchase Request",
    href: "/app/purchase-request/purchase-requests",
    basePath: "/app/purchase-request",
    features: [
      { label: "New Purchase Request", href: "/app/purchase-request/purchase-requests/new", settingsHref: "/app/purchase-request/purchase-requests/settings" },
      { label: "Purchase Request List", href: "/app/purchase-request/purchase-requests", settingsHref: "/app/purchase-request/purchase-requests/settings" },
      { label: "Purchase Request Status", href: "/app/purchase-request/purchase-requests/status", settingsHref: "/app/purchase-request/purchase-requests/settings" },
      { label: "Purchase Order List", href: "/app/purchase-request/purchase-orders", settingsHref: "/app/purchase-request/purchase-requests/settings" },
      { label: "Goods Receipt List", href: "/app/purchase-request/goods-receipt", settingsHref: "/app/purchase-request/purchase-requests/settings" },
    ],
  },
  {
    id: "activity_logs",
    label: "Activity Logs",
    href: "/app/activity-logs",
    basePath: "/app/activity-logs",
    features: [
      {
        label: "Activity Logs",
        href: "/app/activity-logs",
        settingsHref: "/app/activity-logs",
      },
      {
        label: "Change Logs",
        href: "/app/activity-logs/changes",
        settingsHref: "/app/activity-logs/changes",
      },
    ],
  },
  {
    id: "documentation",
    label: "Help & guides",
    href: "/app/documentation",
    basePath: "/app/documentation",
    features: [
      { label: "Help & guides", href: "/app/documentation", settingsHref: "/app/documentation" },
    ],
  },
  {
    id: "user_management",
    label: "User Management",
    href: "/app/user-management/users",
    basePath: "/app/user-management",
    features: [
      {
        label: "Users",
        href: "/app/user-management/users",
        settingsHref: "/app/user-management/users",
      },
      {
        label: "Roles",
        href: "/app/user-management/roles",
        settingsHref: "/app/user-management/roles",
      },
      {
        label: "User Groups",
        href: "/app/user-management/groups",
        settingsHref: "/app/user-management/groups",
      },
    ],
  },
];

export function resolveModule(pathname: string): AppModule | undefined {
  return appModules.find((m) => pathname === m.basePath || pathname.startsWith(`${m.basePath}/`));
}

export function resolveSubBranch(module: AppModule, pathname: string): ModuleFeature | undefined {
  return module.subBranches?.find(
    (b) =>
      b.href === pathname ||
      b.settingsHref === pathname ||
      (b.prefix != null && isSubBranchPath(pathname, b.prefix)),
  );
}

export function resolveFeature(module: AppModule, pathname: string): ModuleFeature | undefined {
  const match = (f: ModuleFeature) =>
    f.href === pathname ||
    f.settingsHref === pathname ||
    (f.prefix != null && isSubBranchPath(pathname, f.prefix));

  return module.features.find(match) ?? module.subBranches?.find(match);
}

export function isFeatureSettings(pathname: string, feature: ModuleFeature): boolean {
  return pathname === feature.settingsHref;
}

export function featureHeaderTitle(feature: ModuleFeature, pathname: string): string {
  return isFeatureSettings(pathname, feature) ? `${feature.label} settings` : feature.label;
}
