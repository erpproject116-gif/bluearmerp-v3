import type { ParentComponent } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { useAuth, canViewCrm, canViewCrmAnalytics, canManageCrmRules, hasPermission } from "../shared/auth-context";
import { moduleDisplayLabel } from "../shared/moduleAccess";
import { permissionCodeForHref } from "../shared/permissionCodes";
import { CrmNotificationBell } from "../shared/CrmNotificationBell";
import { CrmNotificationPoller } from "../shared/CrmNotificationPoller";
import { PresenceAvatars } from "../shared/PresenceAvatars";
import { PresenceHeartbeat } from "../shared/PresenceHeartbeat";
import { IdleLogoutGuard } from "../shared/IdleLogoutGuard";
import { useCrmTaskModal } from "../shared/CrmTaskModal";
import { ShellProvider, useShell } from "./shell-context";
import { resolveFeature, resolveModule, resolveSubBranch, visibleHeaderFeatures } from "./modules";
import { isSubBranchPath } from "./sub-branch-nav";
import { TaxMngtHeaderNav } from "./TaxMngtHeaderNav";
import { CollectiveInvoicingHeaderNav } from "./CollectiveInvoicingHeaderNav";
import { SerialLotHeaderNav } from "./SerialLotHeaderNav";
import { WmsHeaderNav } from "./WmsHeaderNav";
import { AcctIHeaderNav } from "./AcctIHeaderNav";
import { AcctIIHeaderNav } from "./AcctIIHeaderNav";
import { ReviewPurchasesHeaderNav } from "./ReviewPurchasesHeaderNav";
import { taxMngtHeaderTitle } from "./tax-mngt-nav";
import { TAX_MNGT_PREFIX } from "./tax-mngt-nav";
import { collectiveInvoicingHeaderTitle, COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { serialLotHeaderTitle, SERIAL_LOT_PREFIX } from "./serial-lot-nav";
import { wmsHeaderTitle, WMS_PREFIX } from "./wms-nav";
import { acctIHeaderTitle, ACCT_I_PREFIX } from "./acct-i-nav";
import { acctIIHeaderTitle, ACCT_II_PREFIX } from "./acct-ii-nav";
import { isReviewPurchasesPath, reviewPurchasesHeaderTitle } from "./review-purchases-nav";
import { useBranding } from "../shared/branding/BrandingProvider";
import { AppBrandingMark } from "../shared/branding/AppBrandingMark";
import { brandingLabel } from "../shared/branding/brandingStore";
import { navFeatureLabelKey, navModuleLabelKey } from "../shared/branding/navLabels";
import { UserAccountMenu } from "./UserAccountMenu";
import { BusinessBranchSwitcher } from "./BusinessBranchSwitcher";
import { SidebarNav } from "./SidebarNav";
import { EntitlementBanner } from "../shared/EntitlementBanner";
import { DemoTenantBanner } from "../shared/DemoTenantBanner";
import { SetupBreadcrumbHint, SetupReminderBar } from "../shared/SetupReminderBar";
import { SetupFirstRunRedirect } from "../shared/SetupFirstRunRedirect";
import { HelpAssistantProvider } from "../modules/help-assistant/helpAssistantContext";
import { ModuleAccessGate } from "../shared/ModuleAccessGate";
import { OnboardingProminentPanel } from "../shared/OnboardingProminentPanel";
import { WorkflowGuideBar } from "../shared/WorkflowGuideBar";
import { useBootstrapDisplayCurrency } from "../shared/useBootstrapDisplayCurrency";

function subBranchHeaderTitle(pathname: string, prefix?: string): string {
  if (prefix === TAX_MNGT_PREFIX) return taxMngtHeaderTitle(pathname);
  if (prefix === COLLECTIVE_INVOICING_PREFIX) return collectiveInvoicingHeaderTitle(pathname);
  if (prefix === SERIAL_LOT_PREFIX) return serialLotHeaderTitle(pathname);
  if (prefix === WMS_PREFIX) return wmsHeaderTitle(pathname);
  if (prefix === ACCT_I_PREFIX) return acctIHeaderTitle(pathname);
  if (prefix === ACCT_II_PREFIX) return acctIIHeaderTitle(pathname);
  return "Sub-module";
}

function AppShellInner(props: { children?: import("solid-js").JSX.Element }) {
  const loc = useLocation();
  const auth = useAuth();
  const shell = useShell();
  const crmTask = useCrmTaskModal();
  const branding = useBranding();
  useBootstrapDisplayCurrency();

  const appTitle = () =>
    branding.settings().receipt.company_name?.trim() ||
    auth.me?.tenant.company_name ||
    "Bluearm";
  const appTagline = () => brandingLabel("app.tagline", "ERP v3");

  const activeModule = () => resolveModule(loc.pathname);
  const moduleLabel = (mod: NonNullable<ReturnType<typeof resolveModule>>) => {
    const key = navModuleLabelKey(mod.id);
    const override = branding.settings().labels[key];
    const fallback = moduleDisplayLabel(auth.me, mod.id, mod.label);
    return override?.trim() ? override : fallback;
  };
  const featureLabel = (modId: string, feature: NonNullable<ReturnType<typeof resolveFeature>>) => {
    const key = navFeatureLabelKey(modId, feature.href);
    const override = branding.settings().labels[key];
    return override?.trim() ? override : feature.label;
  };
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
    if (!mod || activeSubBranch() || isReviewPurchasesPath(loc.pathname)) return undefined;
    return mod;
  };

  const layout = (
    <div class="flex min-h-screen bg-body">
      <SetupFirstRunRedirect />
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

        <SidebarNav />

        <div class="mt-4 shrink-0 space-y-2 border-t border-stroke pt-3">
          <BusinessBranchSwitcher />
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
                    <SetupBreadcrumbHint />
                    <p class="text-xs font-medium text-text-secondary">{appTitle()}</p>
                    <h1 class="text-xl font-semibold text-text-primary">Home</h1>
                  </>
                }
              >
                {(mod) => (
                  <>
                    <p class="text-xs font-medium text-text-secondary">
                      <Show
                        when={activeSubBranch()}
                        fallback={
                          <>
                            <SetupBreadcrumbHint />
                            <span>{moduleLabel(mod())}</span>
                          </>
                        }
                      >
                        {(branch) => (
                          <>
                            <span>{moduleLabel(mod())}</span>
                            <span class="mx-1.5 text-text-secondary/50" aria-hidden="true">
                              ›
                            </span>
                            <span>{featureLabel(mod().id, branch())}</span>
                          </>
                        )}
                      </Show>
                    </p>
                    <h1 class="truncate text-xl font-semibold text-text-primary">
                      {isReviewPurchasesPath(loc.pathname)
                        ? reviewPurchasesHeaderTitle(loc.pathname)
                        : activeSubBranch()
                          ? subBranchHeaderTitle(loc.pathname, activeSubBranch()!.prefix)
                          : activeFeature()
                            ? (() => {
                                const f = activeFeature()!;
                                const base = featureLabel(mod().id, f);
                                return loc.pathname === f.settingsHref && f.settingsHref !== f.href
                                  ? `${base} settings`
                                  : base;
                              })()
                            : moduleLabel(mod())}
                    </h1>
                  </>
                )}
              </Show>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <PresenceHeartbeat />
              <IdleLogoutGuard />
              <A
                href="/app/documentation"
                class="inline-flex items-center gap-1.5 rounded-lg border border-stroke px-2.5 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
                title="Help & guides"
              >
                <span class="hidden sm:inline">Help &amp; guides</span>
                <span class="sm:hidden">Help</span>
              </A>
              <PresenceAvatars />
              <CrmNotificationPoller enabled={Boolean(auth.me)} />
              <Show when={canViewCrm(auth.me)}>
                <button
                  type="button"
                  class="hidden rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50 sm:inline-flex"
                  onClick={() => crmTask.open()}
                >
                  + CRM task
                </button>
              </Show>
              <CrmNotificationBell enabled={Boolean(auth.me)} />
            </div>
          </div>
          <SetupReminderBar />
          <Show when={featureNavModule()}>
            {(mod) => (
              <Show when={visibleHeaderFeatures(mod(), auth.me).length > 0}>
                <nav class="erp-header-features mt-3" aria-label={`${moduleLabel(mod())} features`}>
                  {visibleHeaderFeatures(mod(), auth.me)
                    .filter((feature) => {
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
                    .map((feature) => {
                      const features = visibleHeaderFeatures(mod(), auth.me);
                      const hasExactTab = features.some(
                        (f) => f.href === loc.pathname || f.settingsHref === loc.pathname,
                      );
                      const active =
                        loc.pathname === feature.href ||
                        loc.pathname === feature.settingsHref ||
                        (!hasExactTab &&
                          feature.prefix != null &&
                          isSubBranchPath(loc.pathname, feature.prefix));
                      return (
                      <A
                        href={feature.href}
                        class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                        classList={{
                          "bg-brand-50 text-brand-600": active,
                          "text-text-secondary hover:erp-panel hover:text-text-primary": !active,
                        }}
                      >
                        {featureLabel(mod().id, feature)}
                      </A>
                      );
                    })}
                </nav>
              </Show>
            )}
          </Show>
          <TaxMngtHeaderNav />
          <CollectiveInvoicingHeaderNav />
          <SerialLotHeaderNav />
          <WmsHeaderNav />
          <ReviewPurchasesHeaderNav />
          <AcctIHeaderNav />
          <AcctIIHeaderNav />
        </header>
        <main class="flex-1 p-6">
          <DemoTenantBanner />
          <EntitlementBanner />
          <WorkflowGuideBar />
          <ModuleAccessGate>{props.children}</ModuleAccessGate>
        </main>
      </div>
    </div>
  );

  return (
    <Show when={auth.me} fallback={layout}>
      <HelpAssistantProvider>
        {layout}
        <OnboardingProminentPanel />
      </HelpAssistantProvider>
    </Show>
  );
}

export const AppShell: ParentComponent = (props) => (
  <ShellProvider>
    <AppShellInner>{props.children}</AppShellInner>
  </ShellProvider>
);
