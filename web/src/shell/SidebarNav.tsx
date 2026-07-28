import { createEffect, createSignal, For, on, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { ModuleIcon } from "./ModuleIcon";
import { useShell } from "./shell-context";
import { navGroups, navGroupStorageKey, isFinanceUnderSalesReportPath } from "./navGroups";
import { isReviewPurchasesPath } from "./review-purchases-nav";
import { isTaxMngtPath } from "./tax-mngt-nav";
import {
  resolveEcountTopFromPath,
  writeStoredEcountTop,
  HOME_SIDEBAR_AREAS,
  type HomeSidebarArea,
} from "./ecount-top-nav";

export function isFinanceModulePath(pathname: string): boolean {
  if (pathname === "/app/finance" || pathname.startsWith("/app/finance/")) return true;
  if (isReviewPurchasesPath(pathname)) return true;
  if (isTaxMngtPath(pathname)) return true;
  if (pathname === "/app/hr/payroll-runs" || pathname.startsWith("/app/hr/payroll-runs/")) return true;
  if (pathname === "/app/fixed-assets" || pathname.startsWith("/app/fixed-assets/")) return true;
  if (isFinanceUnderSalesReportPath(pathname)) return true;
  return false;
}

function pathStarts(pathname: string, bases: string[]): boolean {
  return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
}

function NavAreaLink(props: { area: HomeSidebarArea; active?: boolean; nested?: boolean }) {
  const shell = useShell();
  const loc = useLocation();
  const active = () => {
    if (props.active != null) return props.active;
    const href = props.area.href;
    if (href === "/app/dashboard") {
      return loc.pathname === "/app/dashboard" || loc.pathname === "/app/dashboard/";
    }
    if (href === "/app/dashboard/site-map") {
      return loc.pathname.startsWith("/app/dashboard/site-map");
    }
    return loc.pathname === href || loc.pathname.startsWith(`${href}/`);
  };

  const onNavigate = () => {
    if (props.area.topId) writeStoredEcountTop(props.area.topId);
    if (props.area.expandGroupId) {
      try {
        for (const g of navGroups) {
          localStorage.setItem(navGroupStorageKey(g.id), g.id === props.area.expandGroupId ? "1" : "0");
        }
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <A
      href={props.area.href}
      title={shell.collapsed() ? props.area.label : undefined}
      class="flex items-center rounded-lg text-sm font-medium transition-colors"
      classList={{
        "justify-center px-2 py-2.5": shell.collapsed(),
        "gap-3 px-3 py-2.5": !shell.collapsed() && !props.nested,
        "gap-2 px-3 py-2": !shell.collapsed() && props.nested,
        "bg-brand-50 text-brand-600": active(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !active(),
      }}
      onClick={onNavigate}
    >
      <span
        class="flex shrink-0 items-center justify-center rounded-lg transition-colors"
        classList={{
          "h-8 w-8": !props.nested,
          "h-7 w-7": props.nested,
          "bg-brand-100 text-brand-600": active(),
          "erp-panel text-text-secondary": !active(),
        }}
      >
        <ModuleIcon id={props.area.iconId} class={props.nested ? "h-3.5 w-3.5" : undefined} />
      </span>
      <Show when={!shell.collapsed()}>
        <span class="truncate">{props.area.label}</span>
      </Show>
    </A>
  );
}

function HomeAreaBlock(props: { area: HomeSidebarArea; active: (a: HomeSidebarArea) => boolean }) {
  const shell = useShell();
  const children = () => props.area.children ?? [];
  const areaOrChildActive = () =>
    props.active(props.area) || children().some((c) => props.active(c));
  const [open, setOpen] = createSignal(areaOrChildActive() || children().length > 0);

  createEffect(() => {
    if (areaOrChildActive()) setOpen(true);
  });

  return (
    <div class="space-y-0.5">
      <div class="flex items-center gap-0.5">
        <div class="min-w-0 flex-1">
          <NavAreaLink area={props.area} active={props.active(props.area)} />
        </div>
        <Show when={!shell.collapsed() && children().length > 0}>
          <button
            type="button"
            class="mr-1 rounded p-1 text-text-secondary hover:bg-slate-50 hover:text-text-primary"
            aria-expanded={open()}
            aria-label={open() ? `Collapse ${props.area.label}` : `Expand ${props.area.label}`}
            onClick={() => setOpen((v) => !v)}
          >
            <span class="block text-[10px] transition-transform" classList={{ "rotate-90": open() }} aria-hidden="true">
              ▶
            </span>
          </button>
        </Show>
      </div>
      <Show when={!shell.collapsed() && open() && children().length > 0}>
        <div class="ml-4 space-y-0.5 border-l border-stroke pl-2">
          <For each={children()}>
            {(child) => <NavAreaLink area={child} active={props.active(child)} nested />}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function SidebarNav() {
  const loc = useLocation();
  let navEl: HTMLElement | undefined;
  let savedScrollTop = 0;

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

  const homeActive = (area: HomeSidebarArea) => {
    const p = loc.pathname;
    if (area.id === "home") {
      return (p === "/app/dashboard" || p === "/app/dashboard/") && !p.startsWith("/app/dashboard/site-map");
    }
    if (area.id === "sitemap") return p.startsWith("/app/dashboard/site-map");
    if (area.id === "stocks") {
      return (
        pathStarts(p, ["/app/after-sales", "/app/job-costing"]) ||
        ((p === "/app/inventory" || p.startsWith("/app/inventory/")) &&
          !p.startsWith("/app/inventory/serial-lot") &&
          !p.startsWith("/app/inventory/wms"))
      );
    }
    if (area.id === "warehouse") {
      return pathStarts(p, ["/app/inventory/serial-lot", "/app/inventory/wms"]);
    }
    if (area.id === "sell") {
      if (isFinanceUnderSalesReportPath(p)) return false;
      return pathStarts(p, ["/app/quotation", "/app/sales-order", "/app/sales", "/app/selling"]);
    }
    if (area.id === "buy") {
      if (p.startsWith("/app/purchases/expenses")) return false;
      return pathStarts(p, ["/app/purchase-request", "/app/purchase-order", "/app/purchases", "/app/buying"]);
    }
    if (area.id === "accounting") {
      return p === "/app/finance" || p === "/app/finance/";
    }
    if (area.id === "ledger") {
      return pathStarts(p, [
        "/app/finance/acct-i",
        "/app/finance/journal",
        "/app/finance/official-receipts",
        "/app/finance/reports",
      ]);
    }
    if (area.id === "cash") {
      return (
        pathStarts(p, [
          "/app/finance/acct-ii",
          "/app/finance/collections",
          "/app/finance/disbursements",
          "/app/finance/payment-vouchers",
        ]) || p.startsWith("/app/purchases/expenses")
      );
    }
    if (area.id === "more") {
      return resolveEcountTopFromPath(p) === "more";
    }
    if (area.id === "setup") {
      return resolveEcountTopFromPath(p) === "setup";
    }
    return p === area.href || p.startsWith(`${area.href}/`);
  };

  return (
    <nav
      ref={navEl}
      class="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-1"
      onScroll={(e) => {
        savedScrollTop = e.currentTarget.scrollTop;
      }}
    >
      <For each={HOME_SIDEBAR_AREAS}>{(area) => <HomeAreaBlock area={area} active={homeActive} />}</For>
    </nav>
  );
}
