import type { ParentComponent } from "solid-js";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth, canManageUsers, canViewActivityLogs, canViewCrm, canViewCrmAnalytics, canManageCrmRules, hasModuleAccess, hasPermission } from "../shared/auth-context";
import { permissionCodeForHref } from "../shared/permissionCodes";
import { CrmNotificationBell } from "../shared/CrmNotificationBell";
import { CrmNotificationPoller } from "../shared/CrmNotificationPoller";
import { PresenceAvatars } from "../shared/PresenceAvatars";
import { PresenceHeartbeat, signOutWithPresenceClear } from "../shared/PresenceHeartbeat";
import { UserAvatar } from "../shared/UserAvatar";
import { useCrmTaskModal } from "../shared/CrmTaskModal";
import { ModuleIcon } from "./ModuleIcon";
import { ShellProvider, useShell } from "./shell-context";
import { appModules, featureHeaderTitle, resolveFeature, resolveModule, resolveSubBranch } from "./modules";
import { AfterSalesHeaderNav } from "./AfterSalesHeaderNav";
import { TaxMngtHeaderNav } from "./TaxMngtHeaderNav";
import { afterSalesHeaderTitle } from "./after-sales-nav";
import { taxMngtHeaderTitle } from "./tax-mngt-nav";
import { AFTER_SALES_PREFIX } from "./after-sales-nav";
import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";
import { isAnySubBranchPath } from "./sub-branch-nav";

function subBranchHeaderTitle(pathname: string, prefix?: string): string {
  if (prefix === AFTER_SALES_PREFIX) return afterSalesHeaderTitle(pathname);
  if (prefix === TAX_MNGT_PREFIX) return taxMngtHeaderTitle(pathname);
  return "Sub-module";
}

function AppShellInner(props: { children?: import("solid-js").JSX.Element }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const shell = useShell();
  const crmTask = useCrmTaskModal();

  const activeModule = () => resolveModule(loc.pathname);
  const activeFeature = () => {
    const mod = activeModule();
    return mod ? resolveFeature(mod, loc.pathname) : undefined;
  };

  const activeSubBranch = () => {
    const mod = activeModule();
    return mod ? resolveSubBranch(mod, loc.pathname) : undefined;
  };

  const signOut = async () => {
    await signOutWithPresenceClear();
    navigate("/signin", { replace: true });
  };

  return (
    <div class="flex min-h-screen bg-body">
      <aside
        class="fixed inset-y-0 left-0 z-40 flex flex-col border-r border-stroke bg-white py-6 transition-[width,padding] duration-200 ease-in-out"
        classList={{
          "w-[4.5rem] px-2": shell.collapsed(),
          "w-[18.125rem] px-5": !shell.collapsed(),
        }}
      >
        <div
          class="mb-6 flex items-center gap-3"
          classList={{ "justify-center px-0": shell.collapsed(), "px-2": !shell.collapsed() }}
        >
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm">
            B
          </div>
          <Show when={!shell.collapsed()}>
            <div class="min-w-0">
              <p class="truncate text-lg font-semibold text-text-primary">Bluearm</p>
              <p class="text-xs text-text-secondary">ERP v3</p>
            </div>
          </Show>
        </div>

        <Show when={!shell.collapsed()}>
          <p class="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Modules</p>
        </Show>

        <nav class="flex-1 space-y-1">
          <For each={appModules.filter((m) => {
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
                      "bg-slate-50 text-text-primary": moduleExpanded(),
                      "text-text-secondary hover:bg-slate-50 hover:text-text-primary": !inModule(),
                    }}
                  >
                    <span
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                      classList={{
                        "bg-brand-100 text-brand-600": moduleActive(),
                        "bg-slate-200 text-text-primary": moduleExpanded(),
                        "bg-slate-100 text-slate-500": !inModule(),
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
                                "text-text-secondary hover:bg-slate-50 hover:text-text-primary": !branchActive(),
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

        <Show when={auth.me}>
          <div
            class="mt-4 rounded-xl border border-stroke bg-slate-50"
            classList={{
              "flex justify-center p-2": shell.collapsed(),
              "px-3 py-3": !shell.collapsed(),
            }}
            title={shell.collapsed() ? auth.me!.user.full_name : undefined}
          >
            <Show
              when={!shell.collapsed()}
              fallback={
                <UserAvatar
                  name={auth.me!.user.full_name}
                  avatarUrl={auth.me!.user.avatar_url}
                  size="sm"
                  class="ring-2 ring-brand-50"
                />
              }
            >
              <div class="flex items-center gap-3">
                <UserAvatar name={auth.me!.user.full_name} avatarUrl={auth.me!.user.avatar_url} size="sm" />
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-text-primary">{auth.me!.user.full_name}</p>
                  <p class="truncate text-xs text-text-secondary">{auth.me!.tenant.company_name}</p>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <button
          type="button"
          class="mt-4 flex items-center rounded-lg border border-stroke text-sm text-text-secondary transition hover:bg-slate-50 hover:text-text-primary"
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
            <span>Collapse</span>
          </Show>
        </button>
      </aside>

      <div
        class="flex min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-in-out"
        classList={{
          "ml-[4.5rem]": shell.collapsed(),
          "ml-[18.125rem]": !shell.collapsed(),
        }}
      >
        <header class="sticky top-0 z-30 flex items-center justify-between border-b border-stroke bg-white px-6 py-4 shadow-sm">
          <div>
            <Show
              when={activeModule()}
              fallback={
                <>
                  <p class="text-xs font-medium text-text-secondary">Bluearm ERP</p>
                  <h1 class="text-xl font-semibold text-text-primary">Dashboard</h1>
                </>
              }
            >
              {(mod) => (
                <>
                  <p class="text-xs font-medium text-text-secondary">
                    <Show
                      when={activeSubBranch()}
                      fallback={mod().label}
                    >
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
                  <h1 class="text-xl font-semibold text-text-primary">
                    {activeSubBranch()
                      ? subBranchHeaderTitle(loc.pathname, activeSubBranch()!.prefix)
                      : activeFeature()
                        ? featureHeaderTitle(activeFeature()!, loc.pathname)
                        : mod().label}
                  </h1>
                  <Show when={!activeSubBranch()}>
                    <nav class="mt-3 flex flex-wrap gap-1" aria-label={`${mod().label} features`}>
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
                            "text-text-secondary hover:bg-slate-50 hover:text-text-primary":
                              loc.pathname !== feature.href && loc.pathname !== feature.settingsHref,
                          }}
                        >
                          {feature.label}
                        </A>
                      ))}
                    </nav>
                  </Show>
                  <AfterSalesHeaderNav />
                  <TaxMngtHeaderNav />
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
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-slate-50 hover:text-text-primary"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
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
