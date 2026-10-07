import type { TenantModuleRow } from "../../../shared/moduleAccess";

export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  dashboard: "Business Dashboard",
  inventory: "Inventory",
  "inventory.serial_lot": "Serial & Lot",
  "inventory.wms": "WMS",
  "inventory.price_lists": "Price List",
  after_sales: "After-Sales",
  quotation: "Quotation",
  "quotation.tax_mngt": "Tax Management",
  sales: "Sales",
  "sales.collective_invoicing": "Collective Invoicing (Sales)",
  sales_order: "Sales Order",
  purchase_request: "Purchase Request",
  purchase_order: "Purchase Order",
  purchases: "Purchases",
  crm: "CRM",
  finance: "Accounting overview",
  "finance.acct_i": "Accounting I",
  "finance.acct_ii": "Accounting II",
  "finance.payment_vouchers": "AP Review / Payment Vouchers",
  activity_logs: "Activity Logs",
  operations: "Project Management",
  documentation: "Help & guides",
  user_management: "User Management",
  pos: "Point of Sale",
  manufacturing: "Manufacturing",
  rfq: "RFQ",
};

/** Short catalog blurbs — packaging copy only. */
export const MODULE_BLURBS: Record<string, string> = {
  inventory: "Stock, locations, transfers, and item master.",
  "inventory.serial_lot": "Serial units and lot batches under Inventory.",
  "inventory.wms": "Warehouse operations under Inventory.",
  "inventory.price_lists": "Sell/buy price lists under Inventory.",
  after_sales: "Service and after-sales workflows.",
  quotation: "Customer quotations before orders.",
  "quotation.tax_mngt": "Tax types used with quotations.",
  sales: "Sales invoices and billing engine (also used by POS).",
  "sales.collective_invoicing": "Collective invoicing under Sales.",
  sales_order: "Sales orders, pick, and delivery chain.",
  purchase_request: "Internal purchase requests before POs.",
  purchase_order: "Purchase orders and goods receipt.",
  purchases: "Supplier invoices (AP purchases).",
  crm: "CRM leads and opportunities.",
  finance: "Books, journals, and accounting overview.",
  "finance.acct_i": "Core accounting reports and ledgers.",
  "finance.acct_ii": "Advanced accounting features.",
  "finance.payment_vouchers": "AP review and payment vouchers.",
  pos: "Point of sale terminal and sessions.",
  manufacturing: "BOMs, work orders, and production.",
  rfq: "Request for quotation to suppliers.",
  dashboard: "Business dashboard widgets.",
  operations: "Project / operations hub.",
  documentation: "In-app help and guides.",
  user_management: "Users, roles, and workspace settings.",
  activity_logs: "Audit and activity history.",
};

export const GROUP_ORDER = [
  "Stocks Management",
  "Sales Process",
  "Procurement Process",
  "CRM & Finance",
  "Other",
  "Misc",
] as const;

export type ModuleGroupLabel = (typeof GROUP_ORDER)[number];

export function moduleDisplayName(row: Pick<TenantModuleRow, "module_code" | "module_name">): string {
  return MODULE_DISPLAY_NAMES[row.module_code] ?? row.module_name;
}

export function moduleBlurb(code: string): string {
  return MODULE_BLURBS[code] ?? "Optional workspace capability.";
}

export function groupFor(row: TenantModuleRow): ModuleGroupLabel {
  if (row.module_type === "feature" && row.parent_module) {
    if (row.parent_module === "inventory") return "Stocks Management";
    if (
      row.parent_module === "quotation" ||
      row.parent_module === "sales" ||
      row.parent_module === "sales_order"
    ) {
      return "Sales Process";
    }
    if (row.parent_module === "finance") return "CRM & Finance";
  }
  if (row.module_code === "inventory" || row.module_code === "after_sales") return "Stocks Management";
  if (
    row.module_code === "quotation" ||
    row.module_code === "sales" ||
    row.module_code === "sales_order" ||
    row.module_code === "pos"
  ) {
    return "Sales Process";
  }
  if (
    row.module_code === "purchase_request" ||
    row.module_code === "purchase_order" ||
    row.module_code === "purchases" ||
    row.module_code === "rfq"
  ) {
    return "Procurement Process";
  }
  if (
    row.module_code === "activity_logs" ||
    row.module_code === "documentation" ||
    row.module_code === "user_management"
  ) {
    return "Misc";
  }
  if (row.module_code === "crm" || row.module_code === "finance") return "CRM & Finance";
  return "Other";
}

export function groupRows(rows: TenantModuleRow[]): { label: ModuleGroupLabel; items: TenantModuleRow[] }[] {
  const map = new Map<ModuleGroupLabel, TenantModuleRow[]>();
  for (const r of rows) {
    const g = groupFor(r);
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(r);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
}

function isFeatureOfParent(row: TenantModuleRow, parentCode: string): boolean {
  if (row.module_type !== "feature") return false;
  if (row.parent_module === parentCode) return true;
  return (row.depends_on ?? []).includes(parentCode);
}

export function missingDependenciesForTurnOn(rows: TenantModuleRow[], code: string): TenantModuleRow[] {
  const current = rows.find((r) => r.module_code === code);
  if (!current) return [];
  const enabled = new Map(rows.map((r) => [r.module_code, r.is_enabled]));
  return (current.depends_on ?? [])
    .map((dep) => rows.find((r) => r.module_code === dep))
    .filter((r): r is TenantModuleRow => !!r && !enabled.get(r.module_code));
}

/** Non-feature modules currently on that list `code` in depends_on. */
export function enabledDependents(rows: TenantModuleRow[], code: string): TenantModuleRow[] {
  return rows.filter(
    (r) =>
      r.is_enabled &&
      r.module_code !== code &&
      r.module_type !== "feature" &&
      (r.depends_on ?? []).includes(code),
  );
}

export function featuresCascadedOff(rows: TenantModuleRow[], code: string): TenantModuleRow[] {
  return rows.filter((r) => r.is_enabled && isFeatureOfParent(r, code));
}

export type ToggleDraftResult =
  | { ok: true; rows: TenantModuleRow[]; turnedOn: boolean; cascadedFeatures: TenantModuleRow[]; dependentsStillOn: TenantModuleRow[] }
  | { ok: false; missingDeps: TenantModuleRow[] };

/**
 * Toggle one module in the draft.
 * - Turn on blocked when depends_on are off.
 * - Parent off → cascade feature children off in draft.
 * - Parent on → do NOT force features on (leave feature flags as stored).
 */
export function applyModuleToggle(rows: TenantModuleRow[], code: string): ToggleDraftResult {
  const current = rows.find((r) => r.module_code === code);
  if (!current) return { ok: true, rows, turnedOn: false, cascadedFeatures: [], dependentsStillOn: [] };
  const nextOn = !current.is_enabled;
  if (nextOn) {
    const missing = missingDependenciesForTurnOn(rows, code);
    if (missing.length) return { ok: false, missingDeps: missing };
  }
  const cascaded = nextOn ? [] : featuresCascadedOff(rows, code);
  const dependents = nextOn ? [] : enabledDependents(rows, code);
  const nextRows = rows.map((r) => {
    if (r.module_code === code) return { ...r, is_enabled: nextOn };
    if (!nextOn && isFeatureOfParent(r, code)) {
      return { ...r, is_enabled: false };
    }
    return r;
  });
  return {
    ok: true,
    rows: nextRows,
    turnedOn: nextOn,
    cascadedFeatures: cascaded,
    dependentsStillOn: dependents,
  };
}

export type PresetId = "simple_store" | "full_process";

export function presetModuleFlags(preset: PresetId): Record<string, boolean> {
  if (preset === "simple_store") {
    return {
      quotation: false,
      sales_order: false,
      purchase_request: false,
      sales: true,
      pos: true,
      inventory: true,
      purchases: true,
      purchase_order: true,
    };
  }
  return {
    quotation: true,
    sales_order: true,
    purchase_request: true,
    sales: true,
    purchases: true,
    purchase_order: true,
  };
}

export function applyPresetToRows(rows: TenantModuleRow[], preset: PresetId): TenantModuleRow[] {
  const flags = presetModuleFlags(preset);
  return rows.map((r) => {
    const next = flags[r.module_code];
    return next === undefined ? r : { ...r, is_enabled: next };
  });
}

export type CatalogNode = {
  parent: TenantModuleRow;
  features: TenantModuleRow[];
};

/** Parents with nested features; orphan features appear as their own cards. */
export function catalogNodes(items: TenantModuleRow[]): CatalogNode[] {
  const features = items.filter((r) => r.module_type === "feature");
  const parents = items.filter((r) => r.module_type !== "feature");
  const attached = new Set<string>();
  const nodes: CatalogNode[] = parents.map((parent) => {
    const kids = features.filter((f) => isFeatureOfParent(f, parent.module_code));
    for (const k of kids) attached.add(k.module_code);
    return { parent, features: kids };
  });
  for (const f of features) {
    if (!attached.has(f.module_code)) {
      nodes.push({ parent: f, features: [] });
    }
  }
  return nodes;
}

export function filterRows(rows: TenantModuleRow[], q: string): TenantModuleRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => {
    const label = moduleDisplayName(r).toLowerCase();
    const blurb = moduleBlurb(r.module_code).toLowerCase();
    return (
      label.includes(needle) ||
      r.module_code.toLowerCase().includes(needle) ||
      blurb.includes(needle)
    );
  });
}

export function boolLabel(on: boolean): string {
  return on ? "On" : "Off";
}
