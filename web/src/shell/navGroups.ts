import type { AppModule } from "./modules";
import { appModules } from "./modules";
import { COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { SERIAL_LOT_PREFIX } from "./serial-lot-nav";
import { WMS_PREFIX } from "./wms-nav";
import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";

export type NavGroupEntry =
  | { kind: "module"; moduleId: string }
  | { kind: "subBranch"; moduleId: string; featureCode: string; branchLabel: string };

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
};

export const navGroups: NavGroup[] = [
  {
    id: "stocks_management",
    label: "Stock",
    defaultExpanded: true,
    entries: [
      { kind: "module", moduleId: "inventory" },
      { kind: "subBranch", moduleId: "inventory", featureCode: "inventory.serial_lot", branchLabel: "Serial & Lot" },
      { kind: "subBranch", moduleId: "inventory", featureCode: "inventory.wms", branchLabel: "WMS" },
      { kind: "module", moduleId: "after_sales" },
    ],
  },
  {
    id: "sales_process",
    label: "Selling",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "quotation" },
      { kind: "subBranch", moduleId: "quotation", featureCode: "quotation.tax_mngt", branchLabel: "Taxes" },
      { kind: "module", moduleId: "sales" },
      {
        kind: "subBranch",
        moduleId: "sales",
        featureCode: "sales.collective_invoicing",
        branchLabel: "Group Invoicing",
      },
      { kind: "module", moduleId: "sales_order" },
    ],
  },
  {
    id: "procurement_process",
    label: "Buying",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "purchase_request" },
      { kind: "module", moduleId: "purchase_order" },
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
  "manufacturing",
  "quality",
  "reports",
  "support",
  "pos",
  "hr",
  "fixed_assets",
  "job_costing",
  "data_center",
  "finance",
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
