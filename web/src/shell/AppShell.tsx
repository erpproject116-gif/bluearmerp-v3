import type { ParentComponent } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth, canManageUsers, canViewActivityLogs, canViewCrm, canViewCrmAnalytics, canManageCrmRules, hasModuleAccess, hasPermission } from "../shared/auth-context";
import { permissionCodeForHref } from "../shared/permissionCodes";
import { CrmNotificationBell } from "../shared/CrmNotificationBell";
import { CrmNotificationPoller } from "../shared/CrmNotificationPoller";
import { PresenceAvatars } from "../shared/PresenceAvatars";
import { PresenceHeartbeat } from "../shared/PresenceHeartbeat";
import { useCrmTaskModal } from "../shared/CrmTaskModal";
import { ModuleIcon } from "./ModuleIcon";
import { ShellProvider, useShell } from "./shell-context";
import { appModules, featureHeaderTitle, resolveFeature, resolveModule, resolveSubBranch } from "./modules";
import { TaxMngtHeaderNav } from "./TaxMngtHeaderNav";
import { CollectiveInvoicingHeaderNav } from "./CollectiveInvoicingHeaderNav";
import { SerialLotHeaderNav } from "./SerialLotHeaderNav";
import { taxMngtHeaderTitle } from "./tax-mngt-nav";
import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";
import { collectiveInvoicingHeaderTitle, COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { serialLotHeaderTitle, SERIAL_LOT_PREFIX } from "./serial-lot-nav";
import { useBranding } from "../shared/branding/BrandingProvider";
import { AppBrandingMark } from "../shared/branding/AppBrandingMark";
import { brandingLabel } from "../shared/branding/brandingStore";
import { isAnySubBranchPath } from "./sub-branch-nav";
import { UserAccountMenu } from "./UserAccountMenu";

function subBranchHeaderTitle(pathname: string, prefix?: string): string {
  if (prefix === TAX_MNGT_PREFIX) return taxMngtHeaderTitle(pathname);
  if (prefix === COLLECTIVE_INVOICING_PREFIX) return collectiveInvoicingHeaderTitle(pathname);
  if (prefix === SERIAL_LOT_PREFIX) return serialLotHeaderTitle(pathname);
  return "Sub-module";
}

function AppShellInner(props: { children?: import("solid-js").JSX.Element }) {
  const loc = useLocation();
  const auth = useAuth();
  const shell = useShell();
  const crmTask = useCrmTaskModal();
  const branding = useBranding();

  const appTitle = () =>
    branding.settings().receipt.company_name?.trim() ||
    auth.me?.tenant.company_name ||
    "Bluearm";
  const appTagline = () => brandingLabel("app.tagline", "ERP v3");

  const activeModule = () => resolveModule(loc.pathname);
  const activeFeature = () => {
    const mod = activeModule();
    return mod ? resolveFeature(mod, loc.pathname) : undefined;
  };

  const activeSubBranch = () => {
    const mod = activeModule();
    return mod ? resolveSubBranch(mod, loc.pathname) : undefined;
  };

  const featureNavModule = () => {
    const mod = activeModule();
    if (!mod || activeSubBranch()) return undefined;
    return mod;
  };

  return (
    <div class="flex min-h-screen bg-body">
      <aside
        class="erp-surface fixed inset-y-0 left-0 z-40 flex h-screen flex-col overflow-hidden border-r border-stroke py-6 transition-[width,padding] duration-200 ease-in-out"
        classList={{
          "w-[4.5rem] px-2": shell.collapsed(),
          "w-[18.125rem] px-5": !shell.collapsed(),
        }}
      >
        <div
          class="mb-6 shrink-0 flex items-center gap-3"
          classList={{ "justify-center px-0": shell.collapsed(), "px-2": !shell.collapsed() }}
        >
          <Show
            when={!shell.collapsed()}
            fallback={<AppBrandingMark size="sm" showText={false} />}
          >
            <div class="min-w-0">
              <AppBrandingMark />
              <p class="text-xs text-text-secondary">{appTagline()}</p>
            </div>
          </Show>
        </div>

        <div class="shrink-0">
          <Show when={!shell.collapsed()}>
            <p class="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {brandingLabel("app.modules_heading", "Modules")}
            </p>
          </Show>
        </div>

        <nav class="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
          <For each={appModules.filter((m) => {
            if (m.id === "documentation") return true;
            const codes = auth.me?.enabled_module_codes;
            if (m.id === "user_management" && !canManageUsers(auth.me)) return false;
            if (m.id === "activity_logs" && !canViewActivityLogs(auth.me)) return false;
            if (m.id === "crm" && !canViewCrm(auth.me)) return false;
            if (m.id === "activity_logs" || m.id === "user_management") return true;
            if (!codes?.length) return hasModuleAccess(auth.me, m.id);
            if (!codes.includes(m.id)) return false;
            return hasModuleAccess(auth.me, m.id);
          })}>
            {(module) => {
              const inModule = () => loc.pathname.startsWith(module.basePath);
              const inSubBranch = () => isAnySubBranchPath(loc.pathname, module.subBranches);
              const moduleActive = () => inModule() && !inSubBranch();
              const moduleExpanded = () => inModule() && inSubBranch();
              return (
                <div class="space-y-0.5">
                  <A
                    href={module.href}
                    title={shell.collapsed() ? module.label : undefined}
                    class="flex items-center rounded-lg text-sm font-medium transition-colors"
                    classList={{
                      "justify-center px-2 py-2.5": shell.collapsed(),
                      "gap-3 px-3 py-2.5": !shell.collapsed(),
                      "bg-brand-50 text-brand-600": moduleActive(),
                      "erp-panel text-text-primary": moduleExpanded(),
                      "text-text-secondary hover:erp-panel hover:text-text-primary": !inModule(),
                    }}
                  >
                    <span
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                      classList={{
                        "bg-brand-100 text-brand-600": moduleActive(),
                        "erp-panel-strong text-text-primary": moduleExpanded(),
                        "erp-panel text-text-secondary": !inModule(),
                      }}
                    >
                      <ModuleIcon id={module.id} />
                    </span>
                    <Show when={!shell.collapsed()}>
                      <span class="truncate">{module.label}</span>
                    </Show>
                  </A>
                  <Show when={!shell.collapsed() && module.subBranches?.length}>
                    <div class="ml-9 space-y-0.5 border-l border-stroke pl-2">
                      <For each={module.subBranches}>
                        {(branch) => {
                          const branchActive = () =>
                            branch.prefix != null
                              ? loc.pathname === branch.href ||
                                loc.pathname === branch.settingsHref ||
                                loc.pathname.startsWith(`${branch.prefix}/`)
                              : loc.pathname === branch.href || loc.pathname === branch.settingsHref;
                          return (
                            <A
                              href={branch.href}
                              class="flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                              classList={{
                                "bg-brand-50 text-brand-600": branchActive(),
                                "text-text-secondary hover:erp-panel hover:text-text-primary": !branchActive(),
                              }}
                            >
                              <span class="truncate">{branch.label}</span>
                            </A>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </nav>

        <div class="mt-4 shrink-0 space-y-2 border-t border-stroke pt-3">
          <UserAccountMenu />
          <button
          type="button"
          class="flex items-center rounded-lg border border-stroke text-sm text-text-secondary transition hover:erp-panel hover:text-text-primary"
          classList={{
            "mx-auto h-9 w-9 justify-center": shell.collapsed(),
            "w-full justify-center gap-2 px-3 py-2": !shell.collapsed(),
          }}
          aria-label={shell.collapsed() ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => shell.toggleCollapsed()}
        >
          <svg
            class="h-4 w-4 transition-transform duration-200"
            classList={{ "rotate-180": shell.collapsed() }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
          <Show when={!shell.collapsed()}>
            <span>{brandingLabel("app.collapse_sidebar", "Collapse")}</span>
          </Show>
        </button>
        </div>
      </aside>

      <div
        class="flex min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-in-out"
        classList={{
          "ml-[4.5rem]": shell.collapsed(),
          "ml-[18.125rem]": !shell.collapsed(),
        }}
      >
        <header class="erp-surface sticky top-0 z-30 border-b border-stroke px-6 py-4 shadow-sm">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0 flex-1">
              <Show
                when={activeModule()}
                fallback={
                  <>
                    <p class="text-xs font-medium text-text-secondary">{appTitle()}</p>
                    <h1 class="text-xl font-semibold text-text-primary">Dashboard</h1>
                  </>
                }
              >
                {(mod) => (
                  <>
                    <p class="text-xs font-medium text-text-secondary">
                      <Show when={activeSubBranch()} fallback={mod().label}>
                        {(branch) => (
                          <>
                            <span>{mod().label}</span>
                            <span class="mx-1.5 text-text-secondary/50" aria-hidden="true">
                              ›
                            </span>
                            <span>{branch().label}</span>
                          </>
                        )}
                      </Show>
                    </p>
                    <h1 class="truncate text-xl font-semibold text-text-primary">
                      {activeSubBranch()
                        ? subBranchHeaderTitle(loc.pathname, activeSubBranch()!.prefix)
                        : activeFeature()
                          ? featureHeaderTitle(activeFeature()!, loc.pathname)
                          : mod().label}
                    </h1>
                  </>
                )}
              </Show>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <PresenceHeartbeat />
              <PresenceAvatars />
              <CrmNotificationPoller enabled={canViewCrm(auth.me)} />
              <Show when={canViewCrm(auth.me)}>
                <button
                  type="button"
                  class="hidden rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50 sm:inline-flex"
                  onClick={() => crmTask.open()}
                >
                  + CRM task
                </button>
              </Show>
              <CrmNotificationBell enabled={canViewCrm(auth.me)} />
            </div>
          </div>
          <Show when={featureNavModule()}>
            {(mod) => (
              <nav class="erp-header-features mt-3" aria-label={`${mod().label} features`}>
                {mod()
                  .features.filter((feature) => {
                    if (mod().id === "crm") {
                      if (feature.analyticsOnly && !canViewCrmAnalytics(auth.me)) return false;
                      if (feature.managersOnly && !canManageCrmRules(auth.me)) return false;
                    }
                    const code = permissionCodeForHref(feature.href);
                    if (code && auth.me?.user?.permissions && Object.keys(auth.me.user.permissions).length > 0) {
                      return hasPermission(auth.me, code, "read");
                    }
                    return true;
                  })
                  .map((feature) => (
                    <A
                      href={feature.href}
                      class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      classList={{
                        "bg-brand-50 text-brand-600":
                          loc.pathname === feature.href || loc.pathname === feature.settingsHref,
                        "text-text-secondary hover:erp-panel hover:text-text-primary":
                          loc.pathname !== feature.href && loc.pathname !== feature.settingsHref,
                      }}
                    >
                      {feature.label}
                    </A>
                  ))}
              </nav>
            )}
          </Show>
          <TaxMngtHeaderNav />
          <CollectiveInvoicingHeaderNav />
          <SerialLotHeaderNav />
        </header>
        <main class="flex-1 p-6">{props.children}</main>
      </div>
    </div>
  );
}

export const AppShell: ParentComponent = (props) => (
  <ShellProvider>
    <AppShellInner>{props.children}</AppShellInner>
  </ShellProvider>
);
