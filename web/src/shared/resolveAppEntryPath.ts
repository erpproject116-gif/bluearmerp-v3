import { apiFetch } from "./api";
import type { MeData } from "./auth-context";
import { hasModuleAccess, hasPermission } from "./auth-context";
import { isTenantModuleEnabled } from "./moduleAccess";
import type { SetupReadiness } from "./usePlatform";

export function canManageWorkspaceSetup(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.is_tenant_owner || u.is_store_admin || u.is_platform_superadmin);
}

function hasModuleRead(me: MeData, moduleId: string): boolean {
  if (!isTenantModuleEnabled(me, moduleId)) return false;
  return hasModuleAccess(me, moduleId) || hasPermission(me, moduleId, "read");
}

function hasManufacturingFloorAccess(me: MeData): boolean {
  if (!isTenantModuleEnabled(me, "production")) return false;
  return (
    hasModuleAccess(me, "manufacturing") ||
    hasPermission(me, "manufacturing.work_orders", "read") ||
    hasPermission(me, "manufacturing.boms", "read")
  );
}

/** Non-admin manufacturing-primary users land on the production hub instead of generic Home. */
export function shouldLandOnProductionHome(me: MeData | null | undefined): boolean {
  if (!me || canManageWorkspaceSetup(me)) return false;
  if (!hasManufacturingFloorAccess(me)) return false;

  const role = (me.user.tenant_role ?? "").toLowerCase();
  if (/production|manufacturing|shop\s*floor|\bmfg\b/.test(role)) return true;

  const commercialIds = [
    "sales",
    "quotation",
    "sales_order",
    "purchases",
    "purchase_order",
    "finance",
    "crm",
    "pos",
  ] as const;
  const anyCommercial = commercialIds.some((id) => hasModuleRead(me, id));
  return !anyCommercial;
}

/** Default home route after setup gates (sync; used by tests and entry resolver). */
export function resolveRoleHomePath(me: MeData | null | undefined): string {
  if (shouldLandOnProductionHome(me)) return "/app/production";
  return "/app/dashboard";
}

/** First screen after sign-in — send new workspace admins to setup when foundation is incomplete. */
export async function resolveAppEntryPath(me: MeData | null | undefined): Promise<string> {
  if (!me) return "/signin";
  if (!canManageWorkspaceSetup(me)) return resolveRoleHomePath(me);

  try {
    const res = await apiFetch<SetupReadiness>(
      "/api/v1/platform/setup-readiness",
      {},
      { silent: true, background: true },
    );
    if (res.data && !res.data.required_complete && !res.data.setup_wizard_skipped) {
      return "/app/setup";
    }
  } catch {
    /* fall through */
  }

  return resolveRoleHomePath(me);
}
