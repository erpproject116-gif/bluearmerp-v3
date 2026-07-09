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
  // A direct link to a feature that lives under another module (e.g. Purchases,
  // which is the Supplier Invoices page under the Accounts module). moduleId is
  // used only for tenant-enablement gating.
  | { kind: "link"; moduleId: string; label: string; href: string; basePath: string };

export type NavGroup = {
  id: string;
  label: string;
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

export const navGroups: NavGroup[] = [
  {
    id: "stocks_management",
    label: "Stock",
    defaultExpanded: true,
    entries: [
      { kind: "subBranch", moduleId: "inventory", featureCode: "inventory.wms", branchLabel: "WMS" },
      { kind: "module", moduleId: "inventory" },
      { kind: "subBranch", moduleId: "inventory", featureCode: "inventory.serial_lot", branchLabel: "Serial & Lot" },
      { kind: "module", moduleId: "after_sales" },
    ],
  },
  {
    id: "sales_process",
    label: "Selling",
    defaultExpanded: true,
    entries: [
      { kind: "module", moduleId: "quotation" },
      { kind: "module", moduleId: "sales_order" },
      { kind: "module", moduleId: "sales" },
      {
        kind: "subBranch",
        moduleId: "sales",
        featureCode: "sales.collective_invoicing",
        branchLabel: "Group Invoicing",
      },
    ],
  },
  {
    id: "procurement_process",
    label: "Buying",
    defaultExpanded: true,
    entries: [
      { kind: "module", moduleId: "buying" },
      { kind: "module", moduleId: "purchase_request" },
      { kind: "module", moduleId: "purchase_order" },
    ],
  },
  {
    id: "accounting_dept",
    label: "Accounting Dept",
    defaultExpanded: true,
    entries: [
      { kind: "module", moduleId: "finance" },
      { kind: "subBranch", moduleId: "finance", featureCode: "finance.acct_i", branchLabel: "Acct. I" },
      { kind: "subBranch", moduleId: "finance", featureCode: "finance.acct_ii", branchLabel: "Acct. II" },
      { kind: "subBranch", moduleId: "finance", featureCode: "quotation.tax_mngt", branchLabel: "Taxes" },
      { kind: "subBranch", moduleId: "finance", featureCode: "finance.payment_vouchers", branchLabel: "AP Review" },
    ],
  },
  {
    id: "misc",
    label: "Setup",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "activity_logs" },
      { kind: "module", moduleId: "documentation" },
      { kind: "module", moduleId: "user_management" },
    ],
  },
];

/** Shown after collapsible groups (below Misc). */
export const belowGroupModuleIds = [
  "crm",
  "comms",
  "operations",
  "quality",
  "reports",
  "support",
  "pos",
  "hr",
  "data_center",
] as const;

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
