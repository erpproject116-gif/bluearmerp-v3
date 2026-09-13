import type { ParentComponent } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Show, createEffect, createSignal, For, onCleanup, onMount } from "solid-js";
import { useAuth, canViewCrmNotifications, canViewCrmAnalytics, canManageCrmRules, hasPermission } from "../shared/auth-context";
import { moduleDisplayLabel } from "../shared/moduleAccess";
import { permissionCodeForHref } from "../shared/permissionCodes";
import { CrmNotificationBell } from "../shared/CrmNotificationBell";
import { CrmNotificationPoller } from "../shared/CrmNotificationPoller";
import { PresenceAvatars } from "../shared/PresenceAvatars";
import { PresenceHeartbeat } from "../shared/PresenceHeartbeat";
import { IdleLogoutGuard } from "../shared/IdleLogoutGuard";
import { ShellProvider, useShell } from "./shell-context";
import { resolveFeature, resolveModule, resolveSubBranch, splitHeaderFeatures } from "./modules";
import type { ModuleFeature } from "./modules";
import {
  isFinanceUnderSalesReportPath,
  navGroupForModuleId,
} from "./navGroups";
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
import { CommercialPaywallHost } from "../shared/CommercialPaywall";
import { SetupFirstRunRedirect } from "../shared/SetupFirstRunRedirect";
import { HelpAssistantProvider } from "../modules/help-assistant/helpAssistantContext";
import { ModuleAccessGate } from "../shared/ModuleAccessGate";
import { OnboardingProminentPanel } from "../shared/OnboardingProminentPanel";
import { JoinCompanyConfirm } from "../shared/JoinCompanyConfirm";
import { useBootstrapDisplayCurrency } from "../shared/useBootstrapDisplayCurrency";
import { CommandPalette, useCommandPaletteHotkey } from "./CommandPalette";
import { WorkflowGuideHeaderControl } from "../shared/WorkflowGuideHeader";
import { FloorBottomNav } from "./FloorBottomNav";
import { DesktopPreferredHint } from "./DesktopPreferredHint";

function subBranchHeaderTitle(pathname: string, prefix?: string): string {
  if (prefix === TAX_MNGT_PREFIX) return taxMngtHeaderTitle(pathname);
  if (prefix === COLLECTIVE_INVOICING_PREFIX) return collectiveInvoicingHeaderTitle(pathname);
  if (prefix === SERIAL_LOT_PREFIX) return serialLotHeaderTitle(pathname);
  if (prefix === WMS_PREFIX) return wmsHeaderTitle(pathname);
  if (prefix === ACCT_I_PREFIX) return acctIHeaderTitle(pathname);
  if (prefix === ACCT_II_PREFIX) return acctIIHeaderTitle(pathname);
  return "Sub-module";
}

function featurePassesGates(
  feature: ModuleFeature,
  modId: string,
  me: ReturnType<typeof useAuth>["me"],
): boolean {
  if (modId === "crm") {
    if (feature.analyticsOnly && !canViewCrmAnalytics(me)) return false;
    if (feature.managersOnly && !canManageCrmRules(me)) return false;
  }
  const code = permissionCodeForHref(feature.href);
  if (code && me?.user?.permissions && Object.keys(me.user.permissions).length > 0) {
    return hasPermission(me, code, "read");
  }
  return true;
}

function featureIsActive(feature: ModuleFeature, pathname: string, all: ModuleFeature[]): boolean {
  const hasExactTab = all.some((f) => f.href === pathname || f.settingsHref === pathname);
  return (
    pathname === feature.href ||
    pathname === feature.settingsHref ||
    (!hasExactTab && feature.prefix != null && isSubBranchPath(pathname, feature.prefix))
  );
}

function HeaderFeatureTabs(props: {
  modId: string;
  moduleLabel: string;
  featureLabel: (feature: ModuleFeature) => string;
}) {
  const loc = useLocation();
  const auth = useAuth();
  const [moreOpen, setMoreOpen] = createSignal(false);

  const mod = () => resolveModule(loc.pathname);
  const split = () => {
    const m = mod();
    if (!m) return { primary: [] as ModuleFeature[], overflow: [] as ModuleFeature[] };
    const raw = splitHeaderFeatures(m, auth.me);
    return {
      primary: raw.primary.filter((f) => featurePassesGates(f, props.modId, auth.me)),
      overflow: raw.overflow.filter((f) => featurePassesGates(f, props.modId, auth.me)),
    };
  };
  const allVisible = () => [...split().primary, ...split().overflow];
  const overflowActive = () =>
    split().overflow.some((f) => featureIsActive(f, loc.pathname, allVisible()));

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-header-more-menu]")) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <Show when={allVisible().length > 0}>
      <nav class="erp-header-features mt-3 items-center" aria-label={`${props.moduleLabel} features`}>
        <For each={split().primary}>
          {(feature) => {
            const active = () => featureIsActive(feature, loc.pathname, allVisible());
            return (
              <A
                href={feature.href}
                class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                classList={{
                  "bg-brand-50 text-brand-600": active(),
                  "text-text-secondary hover:erp-panel hover:text-text-primary": !active(),
                }}
              >
                {props.featureLabel(feature)}
              </A>
            );
          }}
        </For>
        <Show when={split().overflow.length > 0}>
          <div class="relative" data-header-more-menu>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              classList={{
                "bg-brand-50 text-brand-600": overflowActive() || moreOpen(),
                "text-text-secondary hover:erp-panel hover:text-text-primary": !overflowActive() && !moreOpen(),
              }}
              aria-expanded={moreOpen()}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setMoreOpen((v) => !v);
              }}
            >
              More
              <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <Show when={moreOpen()}>
              <div
                role="menu"
                class="absolute left-0 z-[60] mt-1 max-h-80 min-w-[14rem] overflow-y-auto rounded-lg border border-stroke bg-surface py-1 shadow-lg"
              >
                <For each={split().overflow}>
                  {(feature) => {
                    const active = () => featureIsActive(feature, loc.pathname, allVisible());
                    return (
                      <A
                        href={feature.href}
                        role="menuitem"
                        class="block whitespace-normal px-3 py-2 text-sm transition-colors"
                        classList={{
                          "bg-brand-50 text-brand-600": active(),
                          "text-text-secondary hover:erp-panel hover:text-text-primary": !active(),
                        }}
                        onClick={() => setMoreOpen(false)}
                      >
                        {props.featureLabel(feature)}
                      </A>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </nav>
    </Show>
  );
}

function AppShellInner(props: { children?: import("solid-js").JSX.Element }) {
  const loc = useLocation();
  const auth = useAuth();
  const shell = useShell();
  const branding = useBranding();
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  useCommandPaletteHotkey(() => setPaletteOpen(true));
  useBootstrapDisplayCurrency();

  const appTitle = () =>
    branding.settings().receipt.company_name?.trim() ||
    auth.me?.tenant.company_name ||
    "Bluearm";
  const appTagline = () => brandingLabel("app.tagline", "ERP v3");
  const hideBreadcrumbs = () => shell.viewport.isNarrow() || shell.viewport.isStandalone();

  // Close drawer on route change.
  createEffect(() => {
    loc.pathname;
    shell.closeDrawer();
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") shell.closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

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

  const pageTitle = () => {
    if (isReviewPurchasesPath(loc.pathname)) return reviewPurchasesHeaderTitle(loc.pathname);
    const mod = activeModule();
    if (!mod) return "Home";
    if (activeSubBranch()) return subBranchHeaderTitle(loc.pathname, activeSubBranch()!.prefix);
    const f = activeFeature();
    if (f) {
      const base = featureLabel(mod.id, f);
      return loc.pathname === f.settingsHref && f.settingsHref !== f.href ? `${base} settings` : base;
    }
    return moduleLabel(mod);
  };

  const layout = (
    <div
      class="flex min-h-screen bg-body"
      classList={{ "pb-16": shell.viewport.useDrawer() || shell.viewport.isStandalone() }}
    >
      <SetupFirstRunRedirect />
      <Show when={shell.viewport.useDrawer() && shell.drawerOpen()}>
        <button
          type="button"
          class="fixed inset-0 z-[45] bg-slate-900/40"
          aria-label="Close menu"
          onClick={() => shell.closeDrawer()}
        />
      </Show>
      <aside
        class="erp-surface fixed inset-y-0 left-0 z-50 flex h-screen flex-col overflow-hidden border-r border-stroke py-6 transition-[width,padding,transform] duration-200 ease-in-out"
        classList={{
          "w-[18.125rem] px-5": shell.viewport.useDrawer() || !shell.collapsed(),
          "w-[4.5rem] px-2": !shell.viewport.useDrawer() && shell.collapsed(),
          "-translate-x-full": shell.viewport.useDrawer() && !shell.drawerOpen(),
          "translate-x-0 shadow-xl": shell.viewport.useDrawer() && shell.drawerOpen(),
        }}
      >
        <div
          class="mb-6 shrink-0 flex items-center gap-3"
          classList={{
            "justify-center px-0": shell.collapsed(),
            "px-2": !shell.collapsed(),
          }}
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

        <SidebarNav />

        <div class="mt-4 shrink-0 space-y-2 border-t border-stroke pt-3">
          <BusinessBranchSwitcher />
          <UserAccountMenu />
          <Show when={!shell.viewport.useDrawer()}>
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
          </Show>
        </div>
      </aside>

      <div
        class={`flex min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-in-out ${shell.mainMargin()}`}
      >
        <header class="erp-surface sticky top-0 z-30 border-b border-stroke px-4 py-3 shadow-sm sm:px-6 sm:py-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <Show when={shell.viewport.useDrawer()}>
                <button
                  type="button"
                  class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stroke text-text-secondary hover:bg-slate-50"
                  aria-label="Open menu"
                  aria-expanded={shell.drawerOpen()}
                  onClick={() => shell.toggleDrawer()}
                >
                  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              </Show>
              <div class="min-w-0 flex-1">
                <Show when={!hideBreadcrumbs()}>
                  <Show
                    when={activeModule()}
                    fallback={
                      <>
                        <SetupBreadcrumbHint />
                        <p class="text-xs font-medium text-text-secondary">{appTitle()}</p>
                      </>
                    }
                  >
                    {(mod) => {
                      const breadcrumbDept = () => {
                        if (isFinanceUnderSalesReportPath(loc.pathname)) {
                          return navGroupForModuleId("finance")?.label;
                        }
                        return navGroupForModuleId(mod().id)?.label;
                      };
                      const crumbSep = () => (
                        <span class="mx-1.5 text-text-secondary/50" aria-hidden="true">
                          ›
                        </span>
                      );
                      return (
                        <p class="text-xs font-medium text-text-secondary">
                          <Show
                            when={activeSubBranch()}
                            fallback={
                              <>
                                <SetupBreadcrumbHint />
                                <Show when={breadcrumbDept()}>
                                  {(dept) => (
                                    <>
                                      <span>{dept()}</span>
                                      {crumbSep()}
                                    </>
                                  )}
                                </Show>
                                <span>{moduleLabel(mod())}</span>
                                <Show when={activeFeature()}>
                                  {(feat) => (
                                    <>
                                      {crumbSep()}
                                      <span>{featureLabel(mod().id, feat())}</span>
                                    </>
                                  )}
                                </Show>
                              </>
                            }
                          >
                            {(branch) => (
                              <>
                                <Show when={breadcrumbDept()}>
                                  {(dept) => (
                                    <>
                                      <span>{dept()}</span>
                                      {crumbSep()}
                                    </>
                                  )}
                                </Show>
                                <span>{moduleLabel(mod())}</span>
                                {crumbSep()}
                                <span>{featureLabel(mod().id, branch())}</span>
                              </>
                            )}
                          </Show>
                        </p>
                      );
                    }}
                  </Show>
                </Show>
                <h1 class="truncate text-lg font-semibold text-text-primary sm:text-xl">{pageTitle()}</h1>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Show when={!shell.viewport.isStandalone()}>
                <WorkflowGuideHeaderControl />
              </Show>
              <button
                type="button"
                class="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-stroke px-2.5 py-1.5 text-sm text-text-secondary transition hover:bg-slate-50 hover:text-text-primary md:min-w-[7.5rem] md:px-3"
                title="Search (Ctrl+K)"
                onClick={() => setPaletteOpen(true)}
              >
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
                <span class="hidden md:inline">Search</span>
                <kbd class="hidden rounded border border-stroke px-1 text-[10px] lg:inline">⌘K</kbd>
              </button>
              <PresenceHeartbeat />
              <IdleLogoutGuard />
              <Show when={!shell.viewport.isStandalone()}>
                <A
                  href="/app/documentation"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-stroke px-2.5 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
                  title="Help & guides"
                >
                  <span class="hidden sm:inline">Help &amp; guides</span>
                  <span class="sm:hidden">Help</span>
                </A>
              </Show>
              <PresenceAvatars compact={shell.viewport.isNarrow() || shell.viewport.isStandalone()} />
              <CrmNotificationPoller
                enabled={canViewCrmNotifications(auth.me)}
                userId={auth.me?.user?.id ?? null}
              />
              <CrmNotificationBell enabled={canViewCrmNotifications(auth.me)} />
            </div>
          </div>
          <SetupReminderBar />
          <CommercialPaywallHost />
          <Show when={!shell.viewport.isStandalone() ? featureNavModule() : undefined}>
            {(mod) => (
              <HeaderFeatureTabs
                modId={mod().id}
                moduleLabel={moduleLabel(mod())}
                featureLabel={(feature) => featureLabel(mod().id, feature)}
              />
            )}
          </Show>
          <Show when={!shell.viewport.isStandalone()}>
            <TaxMngtHeaderNav />
            <CollectiveInvoicingHeaderNav />
            <SerialLotHeaderNav />
            <WmsHeaderNav />
            <ReviewPurchasesHeaderNav />
            <AcctIHeaderNav />
            <AcctIIHeaderNav />
          </Show>
        </header>
        <main class="flex-1 p-4 sm:p-6">
          <DemoTenantBanner />
          <EntitlementBanner />
          <DesktopPreferredHint />
          <ModuleAccessGate>{props.children}</ModuleAccessGate>
        </main>
      </div>
      <FloorBottomNav />
    </div>
  );

  return (
    <HelpAssistantProvider>
      {layout}
      <CommandPalette open={paletteOpen()} onClose={() => setPaletteOpen(false)} />
      <Show when={auth.me}>
        <JoinCompanyConfirm />
        <OnboardingProminentPanel />
      </Show>
    </HelpAssistantProvider>
  );
}

export const AppShell: ParentComponent = (props) => (
  <ShellProvider>
    <AppShellInner>{props.children}</AppShellInner>
  </ShellProvider>
);
