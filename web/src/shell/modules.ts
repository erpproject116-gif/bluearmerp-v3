import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";
import { COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { SERIAL_LOT_PREFIX } from "./serial-lot-nav";
import { WMS_PREFIX } from "./wms-nav";
import { ACCT_I_PREFIX } from "./acct-i-nav";
import { ACCT_II_PREFIX } from "./acct-ii-nav";
import { isReviewPurchasesPath, REVIEW_PURCHASES_SUB_BRANCH } from "./review-purchases-nav";
import { isSubBranchPath } from "./sub-branch-nav";

export { TAX_MNGT_PREFIX, COLLECTIVE_INVOICING_PREFIX, SERIAL_LOT_PREFIX, WMS_PREFIX, ACCT_I_PREFIX, ACCT_II_PREFIX, isSubBranchPath };

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
    label: "Dashboard",
    href: "/app/dashboard",
    basePath: "/app/dashboard",
    features: [
      { label: "Dashboard", href: "/app/dashboard", settingsHref: "/app/dashboard" },
      { label: "Approvals", href: "/app/dashboard/approvals", settingsHref: "/app/dashboard/approvals" },
      { label: "Report Catalogue", href: "/app/reports", settingsHref: "/app/reports" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/app/reports",
    basePath: "/app/reports",
    features: [
      { label: "Catalog", href: "/app/reports", settingsHref: "/app/reports" },
      { label: "Saved Views", href: "/app/reports/saved-views", settingsHref: "/app/reports" },
    ],
  },
  {
    id: "selling",
    label: "Selling",
    href: "/app/selling",
    basePath: "/app/selling",
    features: [
      { label: "Workspace", href: "/app/selling", settingsHref: "/app/selling" },
      { label: "Sales Status", href: "/app/selling/reports", settingsHref: "/app/sales/sales/settings" },
    ],
  },
  {
    id: "inventory",
    label: "Stock",
    href: "/app/inventory",
    basePath: "/app/inventory",
    features: [
      { label: "Workspace", href: "/app/inventory", settingsHref: "/app/inventory" },
      { label: "Partners", href: "/app/inventory/partners", settingsHref: "/app/inventory/partners/settings" },
      { label: "Locations", href: "/app/inventory/locations", settingsHref: "/app/inventory/locations/settings" },
      { label: "Projects", href: "/app/inventory/projects", settingsHref: "/app/inventory/projects/settings" },
      { label: "Departments", href: "/app/inventory/departments", settingsHref: "/app/inventory/departments/settings" },
      { label: "Items", href: "/app/inventory/items", settingsHref: "/app/inventory/items/settings" },
      { label: "Stock Movements", href: "/app/inventory/stock-movements", settingsHref: "/app/inventory/stock-movements" },
      { label: "Stock Entries", href: "/app/inventory/stock-entries", settingsHref: "/app/inventory/stock-entries" },
      { label: "Stock Reconciliation", href: "/app/inventory/stock-reconciliation", settingsHref: "/app/inventory/stock-reconciliation" },
      { label: "Stock Balance", href: "/app/inventory/reports/stock-balance", settingsHref: "/app/inventory/stock-movements" },
      { label: "On Hand", href: "/app/inventory/reports/on-hand", settingsHref: "/app/inventory/stock-movements" },
      { label: "Stock Ledger", href: "/app/inventory/reports/stock-ledger", settingsHref: "/app/inventory/stock-movements" },
      { label: "Inv. Book", href: "/app/inventory/reports/inv-book", settingsHref: "/app/inventory/stock-movements" },
      { label: "Stock Ageing", href: "/app/inventory/reports/stock-ageing", settingsHref: "/app/inventory/stock-movements" },
      { label: "Price List", href: "/app/inventory/price-lists", settingsHref: "/app/inventory/price-lists" },
      { label: "Product Bundles", href: "/app/inventory/product-bundles", settingsHref: "/app/inventory/product-bundles" },
    ],
    subBranches: [
      {
        label: "Serial & Lot",
        prefix: SERIAL_LOT_PREFIX,
        href: "/app/inventory/serial-lot/registry",
        settingsHref: "/app/inventory/serial-lot/settings",
      },
      {
        label: "WMS",
        prefix: WMS_PREFIX,
        href: "/app/inventory/wms/scheduled-receipts",
        settingsHref: "/app/inventory/wms/scheduled-receipts",
      },
    ],
  },
  {
    id: "buying",
    label: "Buying",
    href: "/app/buying",
    basePath: "/app/buying",
    features: [
      { label: "Workspace", href: "/app/buying", settingsHref: "/app/buying" },
      { label: "Purchase Status", href: "/app/buying/reports/purchase-status", settingsHref: "/app/purchases/purchases/settings" },
      { label: "Pre-Invoicing (Purchases)", href: "/app/buying/reports/pre-invoicing", settingsHref: "/app/purchases/purchases/settings" },
    ],
    subBranches: [
      {
        label: "Review Purchases",
        prefix: REVIEW_PURCHASES_SUB_BRANCH,
        href: "/app/finance/payment-vouchers",
        settingsHref: "/app/finance/official-receipts/settings",
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
        label: "Open Quotations",
        href: "/app/quotation/quotations/outstanding",
        settingsHref: "/app/quotation/quotations/settings",
      },
    ],
    subBranches: [
      {
        label: "Taxes",
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
      { label: "New Sale", href: "/app/sales/sales/new", settingsHref: "/app/sales/sales/settings" },
      { label: "Sales List", href: "/app/sales/sales", settingsHref: "/app/sales/sales/settings" },
      { label: "Sales Status", href: "/app/sales/sales/status", settingsHref: "/app/sales/sales/settings" },
      {
        label: "Billing Status",
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
      { label: "Customer Credit Balance", href: "/app/sales/reports/customer-credit-balance", settingsHref: "/app/sales/sales/settings" },
      { label: "Sales Discount Status", href: "/app/sales/reports/discount-status", settingsHref: "/app/sales/sales/settings" },
      { label: "Print Sales Slips", href: "/app/sales/reports/print-slips", settingsHref: "/app/sales/sales/settings" },
      { label: "Sales Returns", href: "/app/sales/sales-returns", settingsHref: "/app/sales/sales/settings" },
      { label: "Commission Rules", href: "/app/sales/commission-rules", settingsHref: "/app/sales/sales/settings" },
    ],
    subBranches: [
      {
        label: "Group Invoicing",
        prefix: COLLECTIVE_INVOICING_PREFIX,
        href: "/app/sales/collective-invoicing/list",
        settingsHref: "/app/sales/sales/settings",
      },
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
        label: "Open Sales Orders",
        href: "/app/sales-order/sales-orders/outstanding",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      {
        label: "Pick List",
        href: "/app/sales-order/sales-orders/release",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      {
        label: "Delivery Note List",
        href: "/app/sales-order/delivery-receipts",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      {
        label: "New Delivery Note",
        href: "/app/sales-order/delivery-receipts/new",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      { label: "SO Analysis", href: "/app/sales-order/reports/so-analysis", settingsHref: "/app/sales-order/sales-orders/settings" },
      { label: "Shipping Orders", href: "/app/sales-order/shipping/orders", settingsHref: "/app/sales-order/shipping/orders" },
      { label: "Shipping Rules", href: "/app/sales-order/shipping/rules", settingsHref: "/app/sales-order/shipping/rules" },
      { label: "Delivery Trips", href: "/app/sales-order/shipping/trips", settingsHref: "/app/sales-order/shipping/trips" },
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
    ],
  },
  {
    id: "purchase_order",
    label: "Purchase Order",
    href: "/app/purchase-order/purchase-orders",
    basePath: "/app/purchase-order",
    features: [
      { label: "Purchase Order List", href: "/app/purchase-order/purchase-orders", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      {
        label: "Request for Quotation",
        href: "/app/purchase-order/rfq",
        settingsHref: "/app/purchase-order/purchase-orders/settings",
        prefix: "/app/purchase-order/rfq",
      },
      { label: "Purchase Returns", href: "/app/purchase-order/purchase-returns", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      { label: "Receiving", href: "/app/purchase-order/goods-receipt", settingsHref: "/app/purchase-order/goods-receipt/settings" },
      { label: "PO Analysis", href: "/app/purchase-order/reports/po-analysis", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      { label: "Items to Receive", href: "/app/purchase-order/reports/items-to-receive", settingsHref: "/app/purchase-order/purchase-orders/settings" },
    ],
  },
  {
    id: "purchases",
    label: "Purchases",
    href: "/app/purchases/purchases",
    basePath: "/app/purchases",
    features: [
      { label: "New Purchase", href: "/app/purchases/purchases/new", settingsHref: "/app/purchases/purchases/settings" },
      { label: "Purchase List", href: "/app/purchases/purchases", settingsHref: "/app/purchases/purchases/settings" },
      { label: "Payment Status", href: "/app/finance/reports/supplier-payment-status", settingsHref: "/app/purchases/purchases/settings" },
      { label: "A/P by Vendor", href: "/app/finance/reports/ap-by-vendor", settingsHref: "/app/purchases/purchases/settings" },
      { label: "A/P Aging", href: "/app/finance/reports/ap-aging", settingsHref: "/app/purchases/purchases/settings" },
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
      { label: "Leads", href: "/app/crm/leads", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Opportunities", href: "/app/crm/opportunities", settingsHref: "/app/crm/settings/alert-rules" },
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
      { label: "Expired Quotations", href: "/app/crm/reports/expired-quotations", settingsHref: "/app/crm/settings/alert-rules", analyticsOnly: true },
      { label: "Alert Rules", href: "/app/crm/settings/alert-rules", settingsHref: "/app/crm/settings/alert-rules", managersOnly: true },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    href: "/app/quality/ncrs",
    basePath: "/app/quality",
    features: [
      { label: "NCRs", href: "/app/quality/ncrs", settingsHref: "/app/quality/ncrs" },
      { label: "QC Requests", href: "/app/quality/qc-requests", settingsHref: "/app/quality/ncrs" },
      { label: "CAPA", href: "/app/quality/capa", settingsHref: "/app/quality/ncrs" },
    ],
  },
  {
    id: "support",
    label: "Support",
    href: "/app/support/tickets",
    basePath: "/app/support",
    features: [
      { label: "Tickets", href: "/app/support/tickets", settingsHref: "/app/support/tickets" },
    ],
  },
  {
    id: "comms",
    label: "Communications",
    href: "/app/comms/sent-documents",
    basePath: "/app/comms",
    features: [
      { label: "Inbox", href: "/app/comms/inbox", settingsHref: "/app/comms/settings" },
      { label: "Sent Documents", href: "/app/comms/sent-documents", settingsHref: "/app/comms/settings" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    href: "/app/operations",
    basePath: "/app/operations",
    features: [
      { label: "Work Hub", href: "/app/operations", settingsHref: "/app/operations" },
      { label: "Calendar", href: "/app/operations/calendar", settingsHref: "/app/operations/calendar" },
      { label: "Timeline", href: "/app/operations/timeline", settingsHref: "/app/operations/timeline" },
      { label: "Dashboard", href: "/app/operations/dashboard", settingsHref: "/app/operations/dashboard" },
      { label: "Automation", href: "/app/operations/automation", settingsHref: "/app/operations/automation" },
    ],
  },
  {
    id: "pos",
    label: "POS",
    href: "/app/pos",
    basePath: "/app/pos",
    features: [
      { label: "Terminal", href: "/app/pos", settingsHref: "/app/pos" },
      { label: "Manage", href: "/app/pos/manage", settingsHref: "/app/pos/manage", managersOnly: true },
    ],
  },
  {
    id: "hr",
    label: "HR & Payroll",
    href: "/app/hr/employees",
    basePath: "/app/hr",
    features: [
      { label: "Employees", href: "/app/hr/employees", settingsHref: "/app/hr/employees" },
      { label: "Payroll Runs", href: "/app/hr/payroll-runs", settingsHref: "/app/hr/payroll-runs" },
    ],
  },
  {
    id: "fixed_assets",
    label: "Fixed Assets",
    href: "/app/fixed-assets",
    basePath: "/app/fixed-assets",
    features: [
      { label: "Asset Register", href: "/app/fixed-assets", settingsHref: "/app/fixed-assets" },
    ],
  },
  {
    id: "job_costing",
    label: "Job Costing",
    href: "/app/job-costing",
    basePath: "/app/job-costing",
    features: [
      { label: "Job Costing", href: "/app/job-costing", settingsHref: "/app/job-costing" },
    ],
  },
  {
    id: "finance",
    label: "Accounts",
    href: "/app/finance",
    basePath: "/app/finance",
    features: [
      { label: "Workspace", href: "/app/finance", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "New Payment Receipt", href: "/app/finance/official-receipts/new", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "Payment Receipt List", href: "/app/finance/official-receipts", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "New Payment Voucher", href: "/app/finance/payment-vouchers/new", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "Payment Voucher List", href: "/app/finance/payment-vouchers", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "A/R by Customer", href: "/app/finance/reports/ar-by-customer", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "A/R Aging", href: "/app/finance/reports/ar-aging", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "AR/AP Status", href: "/app/finance/reports/ar-ap-status", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "Company Budgets", href: "/app/finance/budgets", settingsHref: "/app/finance/budgets" },
      { label: "Budget vs Actual", href: "/app/finance/reports/budget-vs-actual", settingsHref: "/app/finance/official-receipts/settings" },
    ],
    subBranches: [
      {
        label: "Acct. I",
        prefix: ACCT_I_PREFIX,
        href: "/app/finance/acct-i/journal-entries",
        settingsHref: "/app/finance/official-receipts/settings",
      },
      {
        label: "Acct. II",
        prefix: ACCT_II_PREFIX,
        href: "/app/finance/acct-ii/checks",
        settingsHref: "/app/finance/acct-ii/checks",
      },
    ],
  },
  {
    id: "data_center",
    label: "Data Center",
    href: "/app/data-center/ingestion-rules",
    basePath: "/app/data-center",
    features: [
      { label: "Ingestion Rules", href: "/app/data-center/ingestion-rules", settingsHref: "/app/data-center/ingestion-rules" },
      { label: "Inbox", href: "/app/data-center/inbox", settingsHref: "/app/data-center/inbox" },
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
      {
        label: "User Permissions",
        href: "/app/user-management/user-permissions",
        settingsHref: "/app/user-management/user-permissions",
      },
      {
        label: "Module & Features",
        href: "/app/user-management/tenant-modules",
        settingsHref: "/app/user-management/tenant-modules",
      },
      {
        label: "Process Policies",
        href: "/app/user-management/process-policies",
        settingsHref: "/app/user-management/process-policies",
      },
      {
        label: "Mapping Center",
        href: "/app/user-management/mapping-center",
        settingsHref: "/app/user-management/mapping-center",
      },
      {
        label: "Demo Data",
        href: "/app/user-management/demo-data",
        settingsHref: "/app/user-management/demo-data",
      },
    ],
  },
];

export function resolveModule(pathname: string): AppModule | undefined {
  if (pathname === "/app/purchases" || pathname.startsWith("/app/purchases/")) {
    return appModules.find((m) => m.id === "purchases");
  }
  // Review Purchases screens live under /app/finance/* but use Buying header context.
  if (isReviewPurchasesPath(pathname)) {
    return appModules.find((m) => m.id === "buying");
  }
  return appModules.find((m) => pathname === m.basePath || pathname.startsWith(`${m.basePath}/`));
}

function matchesSubBranch(pathname: string, branch: ModuleFeature): boolean {
  if (branch.prefix === REVIEW_PURCHASES_SUB_BRANCH) {
    return isReviewPurchasesPath(pathname);
  }
  return (
    branch.href === pathname ||
    branch.settingsHref === pathname ||
    (branch.prefix != null && isSubBranchPath(pathname, branch.prefix))
  );
}

export function resolveSubBranch(module: AppModule, pathname: string): ModuleFeature | undefined {
  return module.subBranches?.find((b) => matchesSubBranch(pathname, b));
}

export function resolveFeature(module: AppModule, pathname: string): ModuleFeature | undefined {
  const match = (f: ModuleFeature) =>
    f.href === pathname ||
    f.settingsHref === pathname ||
    (f.prefix != null && isSubBranchPath(pathname, f.prefix)) ||
    (pathname.startsWith(f.href + "/") && f.href !== module.basePath);

  return module.features.find(match) ?? module.subBranches?.find((b) => matchesSubBranch(pathname, b));
}

export function isFeatureSettings(pathname: string, feature: ModuleFeature): boolean {
  if (feature.settingsHref === feature.href) return false;
  return pathname === feature.settingsHref;
}

export function featureHeaderTitle(feature: ModuleFeature, pathname: string): string {
  return isFeatureSettings(pathname, feature) ? `${feature.label} settings` : feature.label;
}
