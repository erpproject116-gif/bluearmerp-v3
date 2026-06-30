import type { AppModule } from "./modules";
import { appModules } from "./modules";
import { COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { SERIAL_LOT_PREFIX } from "./serial-lot-nav";
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
  [TAX_MNGT_PREFIX]: "quotation.tax_mngt",
  [COLLECTIVE_INVOICING_PREFIX]: "sales.collective_invoicing",
};

export const navGroups: NavGroup[] = [
  {
    id: "stocks_management",
    label: "Stocks Management",
    defaultExpanded: true,
    entries: [
      { kind: "module", moduleId: "inventory" },
      { kind: "subBranch", moduleId: "inventory", featureCode: "inventory.serial_lot", branchLabel: "Serial & Lot" },
      { kind: "module", moduleId: "after_sales" },
    ],
  },
  {
    id: "sales_process",
    label: "Sales Process",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "quotation" },
      { kind: "subBranch", moduleId: "quotation", featureCode: "quotation.tax_mngt", branchLabel: "Tax Management" },
      { kind: "module", moduleId: "sales" },
      {
        kind: "subBranch",
        moduleId: "sales",
        featureCode: "sales.collective_invoicing",
        branchLabel: "Collective Invoicing (Sales)",
      },
      { kind: "module", moduleId: "sales_order" },
    ],
  },
  {
    id: "procurement_process",
    label: "Procurement Process",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "purchase_request" },
      { kind: "module", moduleId: "purchase_order" },
    ],
  },
  {
    id: "misc",
    label: "Misc",
    defaultExpanded: false,
    entries: [
      { kind: "module", moduleId: "activity_logs" },
      { kind: "module", moduleId: "documentation" },
      { kind: "module", moduleId: "user_management" },
    ],
  },
];

/** Modules shown outside collapsible groups. */
export const ungroupedModuleIds = ["dashboard", "crm", "finance"] as const;

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
