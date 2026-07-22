import { createEffect, createSignal, For, on, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { isTenantFeatureEnabled, isTenantModuleEnabled, moduleDisplayLabel } from "../shared/moduleAccess";
import { navFeatureLabelKey, navModuleLabelKey } from "../shared/branding/navLabels";
import { useBranding } from "../shared/branding/BrandingProvider";
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
  isFinanceUnderSalesReportPath,
  type NavGroupEntry,
} from "./navGroups";
import { isAnySubBranchPath, isSubBranchPath } from "./sub-branch-nav";
import { isReviewPurchasesPath } from "./review-purchases-nav";
import { isTaxMngtPath } from "./tax-mngt-nav";
import { useAuth } from "../shared/auth-context";

function brandedLabel(labels: Record<string, string>, key: string, fallback: string): string {
  const v = labels[key];
  return v?.trim() ? v : fallback;
}

export function isFinanceModulePath(pathname: string): boolean {
  if (pathname === "/app/finance" || pathname.startsWith("/app/finance/")) return true;
  if (isReviewPurchasesPath(pathname)) return true;
  if (isTaxMngtPath(pathname)) return true;
  if (pathname === "/app/hr/payroll-runs" || pathname.startsWith("/app/hr/payroll-runs/")) return true;
  if (pathname === "/app/fixed-assets" || pathname.startsWith("/app/fixed-assets/")) return true;
  if (isFinanceUnderSalesReportPath(pathname)) return true;
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

function writeExpanded(groupId: string, value: boolean) {
  try {
    localStorage.setItem(navGroupStorageKey(groupId), value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function NavModuleLink(props: { module: AppModule }) {
  const loc = useLocation();
  const shell = useShell();
  const auth = useAuth();
  const branding = useBranding();
  const label = () =>
    brandedLabel(
      branding.settings().labels,
      navModuleLabelKey(props.module.id),
      moduleDisplayLabel(auth.me, props.module.id, props.module.label),
    );
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

/** Icon ids for sidebar sub-branch entries (feature codes). */
function subBranchIconId(featureCode: string | undefined): string {
  switch (featureCode) {
    case "inventory.wms":
      return "sub_warehouse";
    case "inventory.serial_lot":
      return "sub_serial_lot";
    case "sales.collective_invoicing":
      return "sub_combined_invoices";
    case "finance.acct_i":
      return "sub_general_ledger";
    case "finance.acct_ii":
      return "sub_ar_ap";
    case "quotation.tax_mngt":
      return "sub_taxes";
    case "finance.payment_vouchers":
      return "sub_supplier_payments";
    default:
      return featureCode?.split(".")[0] || "dashboard";
  }
}

function NavSubBranchLink(props: { module: AppModule; branch: ModuleFeature; featureCode?: string }) {
  const loc = useLocation();
  const shell = useShell();
  const branding = useBranding();
  const branchLabel = () =>
    brandedLabel(
      branding.settings().labels,
      navFeatureLabelKey(props.module.id, props.branch.href),
      props.branch.label,
    );
  const iconId = () => subBranchIconId(props.featureCode ?? props.branch.featureCode);
  const branchActive = () =>
    props.branch.prefix != null
      ? props.branch.href === loc.pathname ||
        props.branch.settingsHref === loc.pathname ||
        isSubBranchPath(loc.pathname, props.branch.prefix)
      : loc.pathname === props.branch.href || loc.pathname === props.branch.settingsHref;

  return (
    <A
      href={props.branch.href}
      title={shell.collapsed() ? branchLabel() : undefined}
      class="flex items-center rounded-lg text-sm font-medium transition-colors"
      classList={{
        "justify-center px-2 py-2.5": shell.collapsed(),
        "gap-3 px-3 py-2.5": !shell.collapsed(),
        "bg-brand-50 text-brand-600": branchActive(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !branchActive(),
      }}
    >
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
        classList={{
          "bg-brand-100 text-brand-600": branchActive(),
          "erp-panel text-text-secondary": !branchActive(),
        }}
      >
        <ModuleIcon id={iconId()} />
      </span>
      <Show when={!shell.collapsed()}>
        <span class="truncate">{branchLabel()}</span>
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
  iconId: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  entries: NavGroupEntry[];
}) {
  const auth = useAuth();
  const shell = useShell();
  const loc = useLocation();

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
          if (!props.open) props.onOpen();
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
    return branch ? (
      <NavSubBranchLink module={mod} branch={branch} featureCode={entry.featureCode} />
    ) : null;
  };

  const toggle = () => {
    if (props.open) props.onClose();
    else props.onOpen();
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
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-slate-50 hover:text-text-primary"
            onClick={toggle}
            aria-expanded={props.open}
          >
            <ModuleIcon id={props.iconId} class="h-4 w-4 shrink-0 opacity-80" />
            <span class="min-w-0 flex-1 truncate">{props.label}</span>
            <span
              class="text-[10px] text-text-secondary/70 transition-transform"
              classList={{ "rotate-90": props.open }}
              aria-hidden="true"
            >
              ▶
            </span>
          </button>
          <Show when={props.open}>
            <div class="ml-2 space-y-0.5 border-l border-stroke pl-2">
              <For each={visibleEntries()}>{(entry) => renderEntry(entry)}</For>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}

function initialOpenGroupId(): string | null {
  for (const group of navGroups) {
    if (readExpanded(group.id, group.defaultExpanded)) return group.id;
  }
  return null;
}

export function SidebarNav() {
  const auth = useAuth();
  const loc = useLocation();
  let navEl: HTMLElement | undefined;
  let savedScrollTop = 0;
  const [openGroupId, setOpenGroupId] = createSignal<string | null>(initialOpenGroupId());

  const openGroup = (groupId: string) => {
    const prev = openGroupId();
    if (prev && prev !== groupId) writeExpanded(prev, false);
    setOpenGroupId(groupId);
    writeExpanded(groupId, true);
  };

  const closeGroup = (groupId: string) => {
    if (openGroupId() === groupId) setOpenGroupId(null);
    writeExpanded(groupId, false);
  };

  createEffect(
    on(
      () => loc.pathname,
      () => {
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
            iconId={group.iconId}
            open={openGroupId() === group.id}
            onOpen={() => openGroup(group.id)}
            onClose={() => closeGroup(group.id)}
            entries={group.entries}
          />
        )}
      </For>

      <For each={belowGroup()}>{(module) => <NavModuleLink module={module} />}</For>
    </nav>
  );
}
