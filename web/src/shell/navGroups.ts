import type { AppModule } from "./modules";
import { appModules } from "./modules";
import { REVIEW_PURCHASES_SUB_BRANCH } from "./review-purchases-nav";
import { COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { SERIAL_LOT_PREFIX } from "./serial-lot-nav";
import { WMS_PREFIX } from "./wms-nav";
import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";
import { ACCT_I_PREFIX } from "./acct-i-nav";
import { ACCT_II_PREFIX } from "./acct-ii-nav";

export type NavGroupEntry =
  | { kind: "module"; moduleId: string }
  | { kind: "subBranch"; moduleId: string; featureCode: string; branchLabel: string }
  // A direct link to a feature that lives under another module (optional shortcut).
  // moduleId is used only for tenant-enablement gating.
  | { kind: "link"; moduleId: string; label: string; href: string; basePath: string };

export type NavGroup = {
  id: string;
  label: string;
  /** Icon id passed to ModuleIcon (group-level sidebar glyph). */
  iconId: string;
  defaultExpanded: boolean;
  entries: NavGroupEntry[];
};

/** Sidebar feature codes for sub-branches (see migration 057). */
export const SUB_BRANCH_FEATURE_CODES: Record<string, string> = {
  [SERIAL_LOT_PREFIX]: "inventory.serial_lot",
  [WMS_PREFIX]: "inventory.wms",
  [TAX_MNGT_PREFIX]: "quotation.tax_mngt",
  [COLLECTIVE_INVOICING_PREFIX]: "sales.collective_invoicing",
  [REVIEW_PURCHASES_SUB_BRANCH]: "finance.payment_vouchers",
  [ACCT_I_PREFIX]: "finance.acct_i",
  [ACCT_II_PREFIX]: "finance.acct_ii",
};

/**
 * Sidebar IA: Stocks (incl. Warehouse) / Sales / Purchase / Accounting.
 * Document pipelines are ordered quote→order→invoice (and PR→PO→invoice); overview hubs last.
 */
export const navGroups: NavGroup[] = [
  {
    id: "stocks_management",
    label: "Stocks",
    iconId: "stocks",
    defaultExpanded: true,
    entries: [
      { kind: "module", moduleId: "inventory" },
      { kind: "module", moduleId: "after_sales" },
      { kind: "subBranch", moduleId: "inventory", featureCode: "inventory.wms", branchLabel: "Warehouse" },
      { kind: "subBranch", moduleId: "inventory", featureCode: "inventory.serial_lot", branchLabel: "Serial / Lot" },
    ],
  },
  {
    id: "sales_process",
    label: "Sales",
    iconId: "selling",
    defaultExpanded: true,
    entries: [
      {
        kind: "link",
        moduleId: "inventory",
        label: "Customers",
        href: "/app/inventory/partners",
        basePath: "/app/inventory/partners",
      },
      { kind: "module", moduleId: "quotation" },
      { kind: "module", moduleId: "sales_order" },
      { kind: "module", moduleId: "sales" },
      {
        kind: "link",
        moduleId: "sales",
        label: "Accounts Receivable",
        href: "/app/finance/receivables",
        basePath: "/app/finance/receivables",
      },
      {
        kind: "subBranch",
        moduleId: "sales",
        featureCode: "sales.collective_invoicing",
        branchLabel: "Combined invoices",
      },
      { kind: "module", moduleId: "selling" },
    ],
  },
  {
    id: "procurement_process",
    label: "Purchase",
    iconId: "buying",
    defaultExpanded: true,
    entries: [
      {
        kind: "link",
        moduleId: "inventory",
        label: "Vendors",
        href: "/app/inventory/partners",
        basePath: "/app/inventory/partners",
      },
      { kind: "module", moduleId: "purchase_request" },
      { kind: "module", moduleId: "purchase_order" },
      { kind: "module", moduleId: "purchases" },
      {
        kind: "link",
        moduleId: "purchases",
        label: "Expenses",
        href: "/app/purchases/expenses",
        basePath: "/app/purchases/expenses",
      },
      {
        kind: "link",
        moduleId: "purchases",
        label: "Accounts Payable",
        href: "/app/finance/payables",
        basePath: "/app/finance/payables",
      },
      { kind: "module", moduleId: "buying" },
    ],
  },
  {
    id: "accounting_dept",
    label: "Accounting",
    iconId: "finance",
    defaultExpanded: true,
    entries: [
      { kind: "subBranch", moduleId: "finance", featureCode: "finance.acct_i", branchLabel: "Ledger" },
      { kind: "subBranch", moduleId: "finance", featureCode: "finance.acct_ii", branchLabel: "AR / AP payments" },
      { kind: "subBranch", moduleId: "finance", featureCode: "quotation.tax_mngt", branchLabel: "Taxes" },
      { kind: "subBranch", moduleId: "finance", featureCode: "finance.payment_vouchers", branchLabel: "Supplier payments" },
      {
        kind: "link",
        moduleId: "finance",
        label: "Banking",
        href: "/app/finance/banking",
        basePath: "/app/finance/banking",
      },
      { kind: "module", moduleId: "finance" },
    ],
  },
  {
    id: "more_apps",
    label: "More apps",
    iconId: "more_apps",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "crm" },
      { kind: "module", moduleId: "booking" },
      { kind: "module", moduleId: "comms" },
      { kind: "module", moduleId: "operations" },
      { kind: "module", moduleId: "sop" },
      { kind: "module", moduleId: "cms" },
      { kind: "module", moduleId: "okr" },
      { kind: "module", moduleId: "quality" },
      { kind: "module", moduleId: "reports" },
      { kind: "module", moduleId: "support" },
      { kind: "module", moduleId: "pos" },
      { kind: "module", moduleId: "hr" },
    ],
  },
  {
    id: "misc",
    label: "Setup",
    iconId: "setup",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "activity_logs" },
      { kind: "module", moduleId: "documentation" },
      { kind: "module", moduleId: "user_management" },
    ],
  },
];

/** Shown after collapsible groups. Empty — rare apps live in More apps. */
export const belowGroupModuleIds = [] as const;

/** Modules shown above collapsible groups. */
export const ungroupedModuleIds = ["dashboard"] as const;

export function moduleById(id: string): AppModule | undefined {
  return appModules.find((m) => m.id === id);
}

export function subBranchByFeature(module: AppModule, featureCode: string) {
  const prefix = Object.entries(SUB_BRANCH_FEATURE_CODES).find(([, code]) => code === featureCode)?.[0];
  if (!prefix) return undefined;
  return module.subBranches?.find((b) => b.prefix === prefix || b.label === featureCode);
}

export function navGroupStorageKey(groupId: string) {
  return `erp-nav-group:${groupId}`;
}

/** Dept group that contains a module id (for breadcrumbs). */
export function navGroupForModuleId(moduleId: string): NavGroup | undefined {
  return navGroups.find((g) =>
    g.entries.some((e) => e.kind === "module" || e.kind === "subBranch" || e.kind === "link"
      ? e.moduleId === moduleId
      : false),
  );
}

/** Accounting-facing report paths that live under /app/sales/reports. */
export const FINANCE_UNDER_SALES_REPORT_PATHS = [
  "/app/sales/reports/ar-by-customer",
  "/app/sales/reports/official-receipt-status",
  "/app/sales/reports/si-receipt-status",
  "/app/sales/reports/customer-credit-balance",
] as const;

export function isFinanceUnderSalesReportPath(pathname: string): boolean {
  return (FINANCE_UNDER_SALES_REPORT_PATHS as readonly string[]).includes(pathname);
}
