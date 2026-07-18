import { type ParentComponent, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { hasPermission, useAuth } from "./auth-context";
import { isTenantFeatureEnabled, isTenantModuleEnabled } from "./moduleAccess";
import { permissionCodeForHref } from "./permissionCodes";
import { resolveFeature, resolveModule } from "../shell/modules";
import { SUB_BRANCH_FEATURE_CODES } from "../shell/navGroups";

const OPEN_PREFIXES = ["/app/setup", "/app/settings/branding", "/app/hr/ess"];

function isOpenPath(pathname: string): boolean {
  return OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Resolve tenant feature code + parent module for a path (sub-branch or feature tab). */
function resolveFeatureGate(
  pathname: string,
): { featureCode: string; parentModuleId: string } | null {
  for (const [prefix, code] of Object.entries(SUB_BRANCH_FEATURE_CODES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      // Registry parent for tax is quotation; others use the nav parent module.
      if (code === "quotation.tax_mngt") return { featureCode: code, parentModuleId: "quotation" };
      if (code.startsWith("inventory.")) return { featureCode: code, parentModuleId: "inventory" };
      if (code.startsWith("sales.")) return { featureCode: code, parentModuleId: "sales" };
      if (code.startsWith("finance.")) return { featureCode: code, parentModuleId: "finance" };
      return { featureCode: code, parentModuleId: "finance" };
    }
  }
  const mod = resolveModule(pathname);
  if (!mod) return null;
  const feat = resolveFeature(mod, pathname);
  if (!feat?.featureCode) return null;
  return { featureCode: feat.featureCode, parentModuleId: mod.id };
}

export const ModuleAccessGate: ParentComponent = (props) => {
  const auth = useAuth();
  const loc = useLocation();

  const denied = () => {
    const pathname = loc.pathname;
    if (isOpenPath(pathname)) return false;

    const mod = resolveModule(pathname);
    if (!mod) return false;
    if (mod.id === "documentation") return false;

    if (!isTenantModuleEnabled(auth.me, mod.id)) return true;

    const gate = resolveFeatureGate(pathname);
    if (gate && !isTenantFeatureEnabled(auth.me, gate.featureCode, gate.parentModuleId)) {
      return true;
    }

    const code = permissionCodeForHref(pathname);
    if (code && auth.me?.user?.permissions && Object.keys(auth.me.user.permissions).length > 0) {
      return !hasPermission(auth.me, code, "read");
    }
    return false;
  };

  return (
    <Show
      when={!denied()}
      fallback={
        <div class="mx-auto max-w-lg rounded-xl border border-stroke bg-white p-6 shadow-sm">
          <p class="text-sm font-medium text-text-primary">You do not have access to this area</p>
          <p class="mt-2 text-sm text-text-secondary">
            This module or feature is turned off, or your role does not include this screen. Ask your administrator
            under Modules &amp; Features / Setup, or open Help &amp; guides for available workflows.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <A
              href="/app/documentation"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Help &amp; guides
            </A>
            <A
              href="/app/user-management/tenant-modules"
              class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
            >
              Modules &amp; Features
            </A>
            <A href="/app/inventory/partners" class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50">
              Go to Stock
            </A>
          </div>
        </div>
      }
    >
      {props.children}
    </Show>
  );
};
