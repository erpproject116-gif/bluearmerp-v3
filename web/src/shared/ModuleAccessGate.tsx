import { type ParentComponent, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { hasPermission, useAuth } from "./auth-context";
import { isTenantModuleEnabled } from "./moduleAccess";
import { permissionCodeForHref } from "./permissionCodes";
import { resolveModule } from "../shell/modules";

const OPEN_PREFIXES = ["/app/setup", "/app/settings/branding", "/app/hr/ess"];

function isOpenPath(pathname: string): boolean {
  return OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
            Your role does not include this module or screen. Ask your administrator to enable the module or grant
            permission, or open Help &amp; guides for available workflows.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <A
              href="/app/documentation"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Help &amp; guides
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
