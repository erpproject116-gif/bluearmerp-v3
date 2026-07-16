import type { MeData } from "./auth-context";
import { canManageUsers, canViewActivityLogs, canViewCrm, hasModuleAccess } from "./auth-context";

export function isTenantModuleEnabled(me: MeData | null | undefined, moduleId: string): boolean {
  // Product kill-switch: keep routes/code but hide from nav and ModuleAccessGate.
  if (moduleId === "data_center") return false;
  if (moduleId === "documentation") return true;
  if (moduleId === "buying") return isTenantModuleEnabled(me, "purchase_order");
  if (moduleId === "selling") {
    return (
      isTenantModuleEnabled(me, "sales") ||
      isTenantModuleEnabled(me, "quotation") ||
      isTenantModuleEnabled(me, "sales_order")
    );
  }
  if (moduleId === "user_management" && !canManageUsers(me)) return false;
  if (moduleId === "activity_logs" && !canViewActivityLogs(me)) return false;
  if (moduleId === "crm" && !canViewCrm(me)) return false;
  if (moduleId === "support" && !canViewCrm(me)) return false;
  if (moduleId === "activity_logs" || moduleId === "user_management") return true;

  const codes = me?.enabled_module_codes;
  if (!codes?.length) return hasModuleAccess(me, moduleId);
  if (!codes.includes(moduleId)) return false;
  return hasModuleAccess(me, moduleId);
}

/** Sub-branch features (migration 057). Falls back to parent module when feature row absent. */
export function isTenantFeatureEnabled(
  me: MeData | null | undefined,
  featureCode: string,
  parentModuleId: string,
): boolean {
  if (!isTenantModuleEnabled(me, parentModuleId)) return false;
  const modules = me?.modules;
  if (!modules?.length) return true;
  const row = modules.find((m) => m.module_code === featureCode);
  if (!row) return true;
  return row.is_enabled;
}

export function moduleDisplayLabel(
  me: MeData | null | undefined,
  moduleId: string,
  fallback: string,
): string {
  const row = me?.modules?.find((m) => m.module_code === moduleId);
  const name = row?.module_name?.trim();
  return name || fallback;
}

export type TenantModuleRow = {
  module_code: string;
  module_name: string;
  module_type: string;
  is_enabled: boolean;
  depends_on: string[];
  can_toggle: boolean;
  parent_module?: string;
};
