import { createEffect, createSignal, For, on, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { ModuleIcon } from "./ModuleIcon";
import { useShell } from "./shell-context";
import { navGroups, navGroupStorageKey, isFinanceUnderSalesReportPath } from "./navGroups";
import { isReviewPurchasesPath } from "./review-purchases-nav";
import { isTaxMngtPath } from "./tax-mngt-nav";
import { isTenantModuleEnabled } from "../shared/moduleAccess";
import { useAuth, type MeData } from "../shared/auth-context";
import {
  writeStoredEcountTop,
  HOME_SIDEBAR_AREAS,
  type HomeSidebarArea,
} from "./ecount-top-nav";
import { useChatUnreadTotal } from "../modules/comms/useChatUnreadTotal";

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

function areaEnabled(area: HomeSidebarArea, me: MeData | null | undefined): boolean {
  if (!area.moduleId) return true;
  return isTenantModuleEnabled(me, area.moduleId);
}

function NavAreaLink(props: {
  area: HomeSidebarArea;
  active?: boolean;
  nested?: boolean;
  badgeCount?: number;
  badgeLabel?: string;
}) {
  const shell = useShell();
  const loc = useLocation();
  const active = () => {
    if (props.active != null) return props.active;
    const href = props.area.href;
    if (href === "/app/dashboard") {
      return (
        loc.pathname === "/app/dashboard" ||
        loc.pathname === "/app/dashboard/" ||
        loc.pathname.startsWith("/app/dashboard/onboarding") ||
        loc.pathname.startsWith("/app/dashboard/getting-started") ||
        loc.pathname.startsWith("/app/dashboard/recent-updates")
      );
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

  const badgeText = () => {
    const n = props.badgeCount ?? 0;
    if (n <= 0) return "";
    if (n > 99) return "99+";
    return String(n);
  };

  return (
    <A
      href={props.area.href}
      title={shell.collapsed() ? props.area.label : undefined}
      class="flex items-center rounded-lg text-sm font-medium transition-colors"
      classList={{
        "justify-center px-2": shell.collapsed(),
        "gap-3 px-3": !shell.collapsed() && !props.nested,
        "gap-2 px-3 py-2": !shell.collapsed() && props.nested,
        "bg-brand-50 text-brand-600": active(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !active(),
      }}
      onClick={onNavigate}
      aria-label={
        badgeText()
          ? `${props.area.label}, ${badgeText()} unread`
          : undefined
      }
    >
      <span
        class="relative flex shrink-0 items-center justify-center rounded-lg transition-colors"
        classList={{
          "h-8 w-8": !props.nested,
          "h-7 w-7": props.nested,
          "bg-brand-100 text-brand-600": active(),
          "erp-panel text-text-secondary": !active(),
        }}
      >
        <ModuleIcon id={props.area.iconId} class={props.nested ? "h-3.5 w-3.5" : undefined} />
        <Show when={shell.collapsed() && badgeText()}>
          <span
            class="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-brand-600 px-1 text-center text-[9px] font-semibold leading-4 text-white"
            aria-hidden="true"
          >
            {badgeText()}
          </span>
        </Show>
      </span>
      <Show when={!shell.collapsed()}>
        <span class="min-w-0 flex-1 truncate">{props.area.label}</span>
        <Show when={badgeText()}>
          <span
            class="ml-1 shrink-0 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white"
            aria-hidden="true"
          >
            {badgeText()}
          </span>
        </Show>
      </Show>
    </A>
  );
}

function HomeAreaBlock(props: {
  area: HomeSidebarArea;
  active: (a: HomeSidebarArea) => boolean;
  childrenOf: (area: HomeSidebarArea) => HomeSidebarArea[];
  badgeCount?: number;
}) {
  const shell = useShell();
  const children = () => props.childrenOf(props.area);
  const areaOrChildActive = () =>
    props.active(props.area) || children().some((c) => props.active(c));
  const initiallyOpen = () => {
    if (areaOrChildActive()) return true;
    if (children().length === 0) return false;
    return props.area.defaultExpanded !== false;
  };
  const [open, setOpen] = createSignal(initiallyOpen());

  createEffect(() => {
    if (areaOrChildActive()) setOpen(true);
  });

  const parentArea = (): HomeSidebarArea => {
    const kids = children();
    if (kids.length === 0) return props.area;
    // Prefer a working landing when the static parent href module is disabled.
    if (kids.some((k) => k.href === props.area.href)) return props.area;
    return { ...props.area, href: kids[0]!.href };
  };

  return (
    <div class="space-y-0.5">
      <div class="flex items-center gap-0.5">
        <div class="min-w-0 flex-1">
          <NavAreaLink
            area={parentArea()}
            active={props.active(props.area)}
            badgeCount={props.area.id === "comms" ? props.badgeCount : undefined}
          />
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
            {(child) => (
              <Show
                when={(child.children ?? []).length > 0}
                fallback={<NavAreaLink area={child} active={props.active(child)} nested />}
              >
                <HomeAreaBlock area={child} active={props.active} childrenOf={props.childrenOf} />
              </Show>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function SidebarNav() {
  const auth = useAuth();
  const loc = useLocation();
  const chatUnread = useChatUnreadTotal();
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

  const childrenOf = (area: HomeSidebarArea) =>
    (area.children ?? []).filter((c) => areaEnabled(c, auth.me));

  const homeActive = (area: HomeSidebarArea) => {
    const p = loc.pathname;
    if (area.id === "home") {
      return (p === "/app/dashboard" || p === "/app/dashboard/") && !p.startsWith("/app/dashboard/site-map");
    }
    if (area.id === "reports_home" || area.id === "reports") {
      return pathStarts(p, ["/app/reports"]);
    }
    if (area.id === "sitemap") return p.startsWith("/app/dashboard/site-map");
    if (area.id === "stocks") {
      return false;
    }
    if (area.id === "inventory") {
      return (
        (p === "/app/inventory" || p.startsWith("/app/inventory/")) &&
        !p.startsWith("/app/inventory/serial-lot") &&
        !p.startsWith("/app/inventory/wms") &&
        !p.startsWith("/app/inventory/partners")
      );
    }
    if (area.id === "after_sales") {
      return pathStarts(p, ["/app/after-sales", "/app/job-costing"]);
    }
    if (area.id === "warehouse") {
      return pathStarts(p, ["/app/inventory/wms"]);
    }
    if (area.id === "serial_lot") {
      return pathStarts(p, ["/app/inventory/serial-lot"]);
    }
    if (area.id === "production") {
      return false;
    }
    if (area.id === "production_workflow") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/production";
    }
    if (area.id === "production_all" || area.id === "production_history") {
      return pathStarts(p, ["/app/production/all"]);
    }
    if (area.id === "production_recipe") {
      return pathStarts(p, ["/app/production/recipe", "/app/production/orders/new"]);
    }
    if (area.id === "production_qc") {
      return pathStarts(p, ["/app/quality"]);
    }
    if (area.id === "production_assembly") {
      return (
        pathStarts(p, ["/app/production/assembly"]) ||
        pathStarts(p, ["/app/production/orders"]) ||
        (pathStarts(p, ["/app/production/issue-station", "/app/production/receive-station"]) &&
          new URLSearchParams(loc.search).get("mode") !== "disassembly")
      );
    }
    if (area.id === "production_disassembly") {
      return (
        pathStarts(p, ["/app/production/disassembly"]) ||
        pathStarts(p, ["/app/production/weigh-parts"]) ||
        (pathStarts(p, ["/app/production/receive-station"]) &&
          new URLSearchParams(loc.search).get("mode") === "disassembly")
      );
    }
    if (area.id === "production_reports") {
      return pathStarts(p, ["/app/production/reports"]);
    }
    if (area.id === "production_setup") {
      return pathStarts(p, ["/app/production/setup"]);
    }
    if (area.id === "sell") {
      return false;
    }
    if (area.id === "customers") {
      const kind = new URLSearchParams(loc.search).get("kind");
      return pathStarts(p, ["/app/inventory/partners"]) && kind !== "vendor";
    }
    if (area.id === "quotation") {
      return pathStarts(p, ["/app/quotation"]) && !p.startsWith("/app/quotation/tax-mngt");
    }
    if (area.id === "sales_order") {
      return pathStarts(p, ["/app/sales-order"]);
    }
    if (area.id === "accounts_receivable") {
      return p === "/app/sales/reports/ar-by-customer" || p.startsWith("/app/selling/reports/receivable-status");
    }
    if (area.id === "sales") {
      if (isFinanceUnderSalesReportPath(p)) return false;
      if (p === "/app/sales/reports/ar-by-customer") return false;
      if (pathStarts(p, ["/app/sales/credit-notes", "/app/sales/retainer-invoices", "/app/sales/recurring-invoices"])) {
        return false;
      }
      return (
        pathStarts(p, ["/app/sales"]) && !p.startsWith("/app/sales/collective-invoicing")
      );
    }
    if (area.id === "credit_notes") {
      return pathStarts(p, ["/app/sales/credit-notes"]);
    }
    if (area.id === "retainer_invoices") {
      return pathStarts(p, ["/app/sales/retainer-invoices"]);
    }
    if (area.id === "recurring_invoices") {
      return pathStarts(p, ["/app/sales/recurring-invoices"]);
    }
    if (area.id === "combined_invoices") {
      return pathStarts(p, ["/app/sales/collective-invoicing"]);
    }
    if (area.id === "selling") {
      return pathStarts(p, ["/app/selling"]);
    }
    if (area.id === "buy") {
      return false;
    }
    if (area.id === "vendors") {
      return pathStarts(p, ["/app/inventory/partners"]) && new URLSearchParams(loc.search).get("kind") === "vendor";
    }
    if (area.id === "purchase_request") {
      return pathStarts(p, ["/app/purchase-request"]);
    }
    if (area.id === "purchase_order") {
      return pathStarts(p, ["/app/purchase-order"]);
    }
    if (area.id === "expenses") {
      return pathStarts(p, ["/app/purchases/expenses"]) && !p.startsWith("/app/purchases/recurring-expenses");
    }
    if (area.id === "recurring_expenses") {
      return pathStarts(p, ["/app/purchases/recurring-expenses"]);
    }
    if (area.id === "vendor_credits") {
      return pathStarts(p, ["/app/purchases/vendor-credits", "/app/buying/vendor-credits"]);
    }
    if (area.id === "accounts_payable") {
      return p === "/app/purchases/purchase-receive/ap-by-vendor" || p.startsWith("/app/purchases/purchase-receive/ap-by-vendor/");
    }
    if (area.id === "purchases") {
      if (p.startsWith("/app/purchases/expenses")) return false;
      if (p.startsWith("/app/purchases/recurring-expenses")) return false;
      if (p.startsWith("/app/purchases/vendor-credits")) return false;
      if (p === "/app/purchases/purchase-receive/ap-by-vendor" || p.startsWith("/app/purchases/purchase-receive/ap-by-vendor/")) {
        return false;
      }
      return pathStarts(p, ["/app/purchases"]);
    }
    if (area.id === "buying") {
      return pathStarts(p, ["/app/buying"]);
    }
    if (area.id === "accounting") {
      return p === "/app/finance" || p === "/app/finance/";
    }
    if (area.id === "bookkeeping") {
      return pathStarts(p, ["/app/finance/bookkeeping", "/app/finance/acct-i"]);
    }
    if (area.id === "ledger") {
      return pathStarts(p, [
        "/app/finance/acct-i/journal-entries",
        "/app/finance/journal-entries",
        "/app/finance/official-receipts",
        "/app/finance/reports",
      ]);
    }
    if (area.id === "cash") {
      return pathStarts(p, ["/app/finance/collections"]);
    }
    if (area.id === "disbursements") {
      return (
        pathStarts(p, [
          "/app/finance/disbursements",
          "/app/finance/payment-vouchers",
          "/app/finance/acct-ii",
        ]) || p.startsWith("/app/purchases/expenses")
      ) && !p.startsWith("/app/finance/banking");
    }
    if (area.id === "banking") {
      return pathStarts(p, ["/app/finance/banking"]);
    }
    if (area.id === "more" || area.id === "setup") {
      return false;
    }
    if (area.id === "crm") return pathStarts(p, ["/app/crm"]);
    if (area.id === "booking") return pathStarts(p, ["/app/booking"]);
    if (area.id === "comms") return pathStarts(p, ["/app/comms"]);
    if (area.id === "operations") return pathStarts(p, ["/app/operations"]);
    if (area.id === "sop") return pathStarts(p, ["/app/sop"]);
    if (area.id === "cms") return pathStarts(p, ["/app/cms"]);
    if (area.id === "okr") return pathStarts(p, ["/app/okr"]);
    if (area.id === "quality") return pathStarts(p, ["/app/quality"]);
    if (area.id === "reports") return pathStarts(p, ["/app/reports"]);
    if (area.id === "support") return pathStarts(p, ["/app/support"]);
    if (area.id === "pos") return pathStarts(p, ["/app/pos"]);
    if (area.id === "hr") {
      return pathStarts(p, ["/app/hr"]) && !p.startsWith("/app/hr/payroll-runs");
    }
    if (area.id === "activity_logs") return pathStarts(p, ["/app/activity-logs"]);
    if (area.id === "documentation") return pathStarts(p, ["/app/documentation"]);
    if (area.id === "user_management") {
      return (
        (pathStarts(p, ["/app/user-management"]) || pathStarts(p, ["/app/settings/branding"])) &&
        !p.startsWith("/app/user-management/process-policies")
      );
    }
    if (area.id === "process_policies") {
      return pathStarts(p, ["/app/user-management/process-policies"]);
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
      <For each={HOME_SIDEBAR_AREAS}>
        {(area) => (
          <Show when={areaEnabled(area, auth.me)}>
            <HomeAreaBlock
              area={area}
              active={homeActive}
              childrenOf={childrenOf}
              badgeCount={area.id === "comms" ? chatUnread.unreadTotal() : undefined}
            />
          </Show>
        )}
      </For>
    </nav>
  );
}
