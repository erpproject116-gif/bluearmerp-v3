import type { PermissionModuleGroup, PermissionRegistryRow } from "./usePermissions";
import { groupFor, MODULE_DISPLAY_NAMES } from "../modules/user-management/tenant-modules/tenantModulesDraft";
import type { TenantModuleRow } from "./moduleAccess";

export type AccessLevel = "deny" | "read" | "write";
export type MatrixValue = AccessLevel | "inherit";

/** Feature toggles on Apps & features. A permission under a turned-off feature stays stored but is hidden. */
const FEATURE_PREFIXES: { feature: string; prefixes: string[] }[] = [
  { feature: "inventory.serial_lot", prefixes: ["inventory.serial_"] },
  { feature: "inventory.wms", prefixes: ["inventory.wms", "wms."] },
  { feature: "inventory.price_lists", prefixes: ["inventory.price_list"] },
  { feature: "quotation.tax_mngt", prefixes: ["quotation.tax_", "quotation.currencies"] },
  { feature: "sales.collective_invoicing", prefixes: ["sales.collective_"] },
  { feature: "finance.acct_i", prefixes: ["finance.acct_i"] },
  { feature: "finance.acct_ii", prefixes: ["finance.acct_ii"] },
  { feature: "finance.payment_vouchers", prefixes: ["finance.payment_vouchers"] },
];

const GROUP_RANK = ["Stocks Management", "Sales Process", "Procurement Process", "CRM & Finance", "Other", "Misc"];

const MODULE_ACRONYMS = new Set(["hr", "bi", "cms", "wms", "pos", "crm", "okr", "sop"]);

function humanizeModuleCode(code: string): string {
  return code
    .split("_")
    .map((part) =>
      MODULE_ACRONYMS.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

/** Name shown on the role screen. Prefers the Apps & features label over a raw code. */
export function permissionModuleLabel(code: string, apiLabel: string): string {
  const known = MODULE_DISPLAY_NAMES[code];
  if (known) return known;
  const label = apiLabel.trim();
  if (label && label !== code && !label.includes("_")) return label;
  return humanizeModuleCode(code);
}

export function permissionModuleGroup(code: string): string {
  return groupFor(stub(code));
}

function stub(code: string): TenantModuleRow {
  return {
    module_code: code,
    module_name: code,
    module_type: "module",
    is_enabled: true,
    depends_on: [],
    can_toggle: true,
  };
}

export function permissionHiddenByFeature(
  permissionCode: string,
  enabled: Set<string> | null,
): boolean {
  if (enabled == null) return false;
  for (const row of FEATURE_PREFIXES) {
    if (enabled.has(row.feature)) continue;
    if (row.prefixes.some((prefix) => permissionCode === prefix || permissionCode.startsWith(prefix))) {
      return true;
    }
  }
  return false;
}

export function orderPermissionGroups(groups: PermissionModuleGroup[]): PermissionModuleGroup[] {
  return [...groups].sort((a, b) => {
    const ga = GROUP_RANK.indexOf(groupFor(stub(a.module_code)));
    const gb = GROUP_RANK.indexOf(groupFor(stub(b.module_code)));
    const ra = ga < 0 ? GROUP_RANK.length : ga;
    const rb = gb < 0 ? GROUP_RANK.length : gb;
    if (ra !== rb) return ra - rb;
    return a.module_code.localeCompare(b.module_code);
  });
}

export function rowAllowed(level: MatrixValue | undefined): boolean {
  return level === "read" || level === "write";
}

export function visibleGroupPermissions(
  group: PermissionModuleGroup,
  opts: {
    enabled: Set<string> | null;
    query: string;
    filter: "all" | "allowed" | "denied";
    values: Record<string, MatrixValue>;
  },
): PermissionRegistryRow[] {
  if (opts.enabled && !opts.enabled.has(group.module_code)) return [];
  const q = opts.query.trim().toLowerCase();
  return group.permissions.filter((perm) => {
    if (permissionHiddenByFeature(perm.permission_code, opts.enabled)) return false;
    if (q && !`${perm.label} ${perm.permission_code}`.toLowerCase().includes(q)) return false;
    const level = opts.values[perm.permission_code];
    if (opts.filter === "allowed" && !rowAllowed(level)) return false;
    if (opts.filter === "denied" && rowAllowed(level)) return false;
    return true;
  });
}
