import { createEffect, createSignal, For, on, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { useAuth } from "../shared/auth-context";
import { isTenantFeatureEnabled, isTenantModuleEnabled, moduleDisplayLabel } from "../shared/moduleAccess";
import { ModuleIcon } from "./ModuleIcon";
import { useShell } from "./shell-context";
import {
  appModules,
  type AppModule,
  type ModuleFeature,
} from "./modules";
import {
  navGroups,
  navGroupStorageKey,
  subBranchByFeature,
  belowGroupModuleIds,
  ungroupedModuleIds,
  type NavGroupEntry,
} from "./navGroups";
import { isAnySubBranchPath, isSubBranchPath } from "./sub-branch-nav";
import { isReviewPurchasesPath } from "./review-purchases-nav";
import { isTaxMngtPath } from "./tax-mngt-nav";

function isFinanceModulePath(pathname: string): boolean {
  if (pathname === "/app/finance" || pathname.startsWith("/app/finance/")) return true;
  if (isReviewPurchasesPath(pathname)) return true;
  if (isTaxMngtPath(pathname)) return true;
  if (pathname === "/app/purchases" || pathname.startsWith("/app/purchases/")) return true;
  if (pathname === "/app/hr/payroll-runs" || pathname.startsWith("/app/hr/payroll-runs/")) return true;
  if (pathname === "/app/fixed-assets" || pathname.startsWith("/app/fixed-assets/")) return true;
  if (pathname === "/app/job-costing" || pathname.startsWith("/app/job-costing/")) return true;
  if (
    pathname === "/app/sales/reports/ar-by-customer" ||
    pathname === "/app/sales/reports/official-receipt-status" ||
    pathname === "/app/sales/reports/si-receipt-status" ||
    pathname === "/app/sales/reports/customer-credit-balance"
  ) {
    return true;
  }
  return false;
}

function readExpanded(groupId: string, defaultExpanded: boolean): boolean {
  try {
    const v = localStorage.getItem(navGroupStorageKey(groupId));
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return defaultExpanded;
}

function NavModuleLink(props: { module: AppModule }) {
  const loc = useLocation();
  const shell = useShell();
  const auth = useAuth();
  const label = () => moduleDisplayLabel(auth.me, props.module.id, props.module.label);
  const inModule = () => {
    if (props.module.id === "finance") return isFinanceModulePath(loc.pathname);
    return loc.pathname.startsWith(props.module.basePath);
  };
  const inSubBranch = () => isAnySubBranchPath(loc.pathname, props.module.subBranches);
  const moduleActive = () => inModule() && !inSubBranch();
  const moduleExpanded = () => inModule() && inSubBranch();

  return (
    <A
      href={props.module.href}
      title={shell.collapsed() ? label() : undefined}
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
        <ModuleIcon id={props.module.id} />
      </span>
      <Show when={!shell.collapsed()}>
        <span class="truncate">{label()}</span>
      </Show>
    </A>
  );
}

function NavCustomLink(props: { label: string; href: string; basePath: string; iconId: string }) {
  const loc = useLocation();
  const shell = useShell();
  const active = () =>
    loc.pathname === props.basePath || loc.pathname.startsWith(`${props.basePath}/`);

  return (
    <A
      href={props.href}
      title={shell.collapsed() ? props.label : undefined}
      class="flex items-center rounded-lg text-sm font-medium transition-colors"
      classList={{
        "justify-center px-2 py-2.5": shell.collapsed(),
        "gap-3 px-3 py-2.5": !shell.collapsed(),
        "bg-brand-50 text-brand-600": active(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !active(),
      }}
    >
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
        classList={{
          "bg-brand-100 text-brand-600": active(),
          "erp-panel text-text-secondary": !active(),
        }}
      >
        <ModuleIcon id={props.iconId} />
      </span>
      <Show when={!shell.collapsed()}>
        <span class="truncate">{props.label}</span>
      </Show>
    </A>
  );
}

function NavSubBranchLink(props: { module: AppModule; branch: ModuleFeature }) {
  const loc = useLocation();
  const shell = useShell();
  const branchActive = () =>
    props.branch.prefix != null
      ? props.branch.href === loc.pathname ||
        props.branch.settingsHref === loc.pathname ||
        isSubBranchPath(loc.pathname, props.branch.prefix)
      : loc.pathname === props.branch.href || loc.pathname === props.branch.settingsHref;

  return (
    <A
      href={props.branch.href}
      class="flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      classList={{
        "bg-brand-50 text-brand-600": branchActive(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !branchActive(),
      }}
    >
      <Show when={!shell.collapsed()}>
        <span class="truncate">{props.branch.label}</span>
      </Show>
    </A>
  );
}

function navEntryMatchesPath(entry: NavGroupEntry, pathname: string): boolean {
  if (entry.kind === "link") {
    return pathname === entry.basePath || pathname.startsWith(`${entry.basePath}/`);
  }
  const mod = appModules.find((m) => m.id === entry.moduleId);
  if (!mod) return false;
  if (entry.kind === "module") {
    if (mod.id === "finance") return isFinanceModulePath(pathname);
    return pathname === mod.basePath || pathname.startsWith(`${mod.basePath}/`);
  }
  const branch = subBranchByFeature(mod, entry.featureCode);
  if (!branch) return false;
  if (branch.prefix != null) {
    return (
      branch.href === pathname ||
      branch.settingsHref === pathname ||
      isSubBranchPath(pathname, branch.prefix)
    );
  }
  return pathname === branch.href || pathname === branch.settingsHref;
}

function NavGroupBlock(props: {
  groupId: string;
  label: string;
  defaultExpanded: boolean;
  entries: NavGroupEntry[];
}) {
  const auth = useAuth();
  const shell = useShell();
  const loc = useLocation();
  const [open, setOpen] = createSignal(readExpanded(props.groupId, props.defaultExpanded));

  const visibleEntries = () =>
    props.entries.filter((entry) => {
      if (entry.kind === "module" || entry.kind === "link") {
        return isTenantModuleEnabled(auth.me, entry.moduleId);
      }
      return isTenantFeatureEnabled(auth.me, entry.featureCode, entry.moduleId);
    });

  createEffect(
    on(
      () => [loc.pathname, visibleEntries().length] as const,
      ([pathname]) => {
        if (visibleEntries().some((entry) => navEntryMatchesPath(entry, pathname))) {
          if (!open()) {
            setOpen(true);
            try {
              localStorage.setItem(navGroupStorageKey(props.groupId), "1");
            } catch {
              /* ignore */
            }
          }
        }
      },
    ),
  );

  const renderEntry = (entry: NavGroupEntry) => {
    if (entry.kind === "link") {
      return (
        <NavCustomLink label={entry.label} href={entry.href} basePath={entry.basePath} iconId="purchases" />
      );
    }
    const mod = appModules.find((m) => m.id === entry.moduleId);
    if (!mod) return null;
    if (entry.kind === "module") {
      return <NavModuleLink module={mod} />;
    }
    const branch = subBranchByFeature(mod, entry.featureCode);
    return branch ? <NavSubBranchLink module={mod} branch={branch} /> : null;
  };

  const toggle = () => {
    const next = !open();
    setOpen(next);
    try {
      localStorage.setItem(navGroupStorageKey(props.groupId), next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <Show when={visibleEntries().length > 0}>
      <div class="space-y-0.5">
        <Show
          when={!shell.collapsed()}
          fallback={<For each={visibleEntries()}>{(entry) => renderEntry(entry)}</For>}
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-slate-50"
            onClick={toggle}
          >
            <span
              class="text-[10px] transition-transform"
              classList={{ "rotate-90": open() }}
              aria-hidden="true"
            >
              ▶
            </span>
            <span class="truncate">{props.label}</span>
          </button>
          <Show when={open()}>
            <div class="ml-2 space-y-0.5 border-l border-stroke pl-2">
              <For each={visibleEntries()}>{(entry) => renderEntry(entry)}</For>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}

export function SidebarNav() {
  const auth = useAuth();
  const loc = useLocation();
  const shell = useShell();
  let navEl: HTMLElement | undefined;
  let savedScrollTop = 0;

  createEffect(
    on(
      () => loc.pathname,
      (pathname) => {
        // #region agent log
        fetch("http://127.0.0.1:7860/ingest/4e7a973e-c880-478e-9306-d7b0547d6f55", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a1498a" },
          body: JSON.stringify({
            sessionId: "a1498a",
            runId: "pre-fix",
            hypothesisId: "H4",
            location: "SidebarNav.tsx:route-change",
            message: "Sidebar route change",
            data: { pathname },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        queueMicrotask(() => {
          if (navEl) navEl.scrollTop = savedScrollTop;
        });
      },
    ),
  );

  const ungrouped = () =>
    ungroupedModuleIds
      .map((id) => appModules.find((m) => m.id === id))
      .filter((m): m is AppModule => !!m && isTenantModuleEnabled(auth.me, m.id));

  const belowGroup = () =>
    belowGroupModuleIds
      .map((id) => appModules.find((m) => m.id === id))
      .filter((m): m is AppModule => !!m && isTenantModuleEnabled(auth.me, m.id));

  return (
    <nav
      ref={navEl}
      class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
      onScroll={(e) => {
        savedScrollTop = e.currentTarget.scrollTop;
      }}
    >
      <For each={ungrouped()}>{(module) => <NavModuleLink module={module} />}</For>

      <For each={navGroups}>
        {(group) => (
          <NavGroupBlock
            groupId={group.id}
            label={group.label}
            defaultExpanded={group.defaultExpanded}
            entries={group.entries}
          />
        )}
      </For>

      <For each={belowGroup()}>{(module) => <NavModuleLink module={module} />}</For>

      <Show when={auth.me?.user.is_platform_superadmin}>
        <div class="space-y-1 border-t border-stroke pt-3">
          <p class="px-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Platform</p>
          <A
            href="/app/platform/customers"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:erp-panel hover:text-text-primary"
            classList={{
              "bg-brand-50 text-brand-600": loc.pathname.startsWith("/app/platform/customers"),
              "justify-center": shell.collapsed(),
            }}
            title={shell.collapsed() ? "Customers" : undefined}
          >
            <span class="text-base" aria-hidden="true">👥</span>
            <Show when={!shell.collapsed()}><span>Customers</span></Show>
          </A>
          <A
            href="/app/platform/plans"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:erp-panel hover:text-text-primary"
            classList={{
              "bg-brand-50 text-brand-600": loc.pathname.startsWith("/app/platform/plans"),
              "justify-center": shell.collapsed(),
            }}
            title={shell.collapsed() ? "Plans & pricing" : undefined}
          >
            <span class="text-base" aria-hidden="true">₱</span>
            <Show when={!shell.collapsed()}><span>Plans & pricing</span></Show>
          </A>
        </div>
      </Show>
    </nav>
  );
}
