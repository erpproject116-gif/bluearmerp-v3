import { AFTER_SALES_PREFIX } from "./after-sales-nav";
import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";
import { isSubBranchPath } from "./sub-branch-nav";

export { AFTER_SALES_PREFIX, TAX_MNGT_PREFIX, isSubBranchPath };

export type ModuleFeature = {
  label: string;
  href: string;
  settingsHref: string;
  /** Path prefix for sidebar sub-branch detection (e.g. /app/inventory/after-sales). */
  prefix?: string;
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
    ],
    subBranches: [
      {
        label: "After-Sales",
        prefix: AFTER_SALES_PREFIX,
        href: "/app/inventory/after-sales/repair-orders",
        settingsHref: "/app/inventory/after-sales/repair-orders/settings",
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
