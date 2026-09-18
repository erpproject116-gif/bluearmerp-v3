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
import { canManageWorkspaceSetup } from "../shared/resolveAppEntryPath";

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
  if (area.kind === "separator") return true;
  if (!area.moduleId) return true;
  return isTenantModuleEnabled(me, area.moduleId);
}

function NavAreaLink(props: {
  area: HomeSidebarArea;
  /** Prefer a function so query-string changes recompute highlight. */
  activeCheck?: () => boolean;
  nested?: boolean;
  badgeCount?: number;
  badgeLabel?: string;
}) {
  const shell = useShell();
  const loc = useLocation();
  const active = () => {
    if (props.activeCheck) return props.activeCheck();
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
      end={
        props.area.id === "sell" ||
        props.area.id === "buy" ||
        props.area.id === "quotation" ||
        props.area.id === "sales_order" ||
        props.area.id === "rfq" ||
        props.area.id === "purchase_request" ||
        props.area.id === "purchase_order" ||
        props.area.id === "expense" ||
        props.area.id === "sales_process" ||
        props.area.id === "purchase_process"
      }
      title={shell.collapsed() ? props.area.label : undefined}
      class="flex items-center rounded-lg text-sm font-medium transition-colors"
      classList={{
        "justify-center px-2": shell.collapsed(),
        "gap-3 px-3": !shell.collapsed() && !props.nested,
        "gap-2 px-3 py-2": !shell.collapsed() && props.nested,
        "bg-brand-50 text-brand-600": active(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !active(),
      }}
      // Pathname-only router matching would light up every ?view= sibling; drive active ourselves.
      activeClass=""
      inactiveClass=""
      aria-current={active() ? "page" : undefined}
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
  const descendantActive = (area: HomeSidebarArea): boolean => {
    if (props.active(area)) return true;
    return props.childrenOf(area).some((c) => descendantActive(c));
  };
  const areaOrChildActive = () => descendantActive(props.area);
  const initiallyOpen = () => {
    if (areaOrChildActive()) return true;
    if (children().length === 0) return false;
    return props.area.defaultExpanded !== false;
  };
  const [open, setOpen] = createSignal(initiallyOpen());

  createEffect(() => {
    if (areaOrChildActive()) setOpen(true);
  });

  return (
    <div class="space-y-0.5">
      <div class="flex items-center gap-0.5">
        <div class="min-w-0 flex-1">
          <NavAreaLink
            area={props.area}
            activeCheck={() => props.active(props.area)}
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
                fallback={<NavAreaLink area={child} activeCheck={() => props.active(child)} nested />}
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
  const shell = useShell();
  const chatUnread = useChatUnreadTotal();
  let navEl: HTMLElement | undefined;
  let savedScrollTop = 0;

  createEffect(
    on(
      () => [loc.pathname, loc.search] as const,
      () => {
        queueMicrotask(() => {
          if (navEl) navEl.scrollTop = savedScrollTop;
        });
      },
    ),
  );

  const childrenOf = (area: HomeSidebarArea) =>
    (area.children ?? []).filter((c) => areaEnabled(c, auth.me));

  /** Floor standalone: hide More Apps noise unless owner/admin (drawer still has core modules). */
  const sidebarAreas = () =>
    HOME_SIDEBAR_AREAS.filter((area) => {
      if (area.id !== "more") return true;
      if (!shell.viewport.isStandalone()) return true;
      return canManageWorkspaceSetup(auth.me);
    });

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
    if (area.id === "sales_process" || area.id === "purchase_process") {
      return false;
    }
    if (area.id === "production_workflow") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/production";
    }
    if (area.id === "production_all") {
      return pathStarts(p, ["/app/production/all/jobs", "/app/production/all/recipes"]);
    }
    if (area.id === "production_recipe") {
      return (
        pathStarts(p, ["/app/production/recipe/jobs", "/app/production/recipe/recipes"]) ||
        (pathStarts(p, ["/app/production/orders/new"]) &&
          new URLSearchParams(loc.search).get("type") === "recipe")
      );
    }
    if (area.id === "production_assembly") {
      const orderType = new URLSearchParams(loc.search).get("type");
      return (
        pathStarts(p, ["/app/production/assembly/jobs", "/app/production/assembly/recipes"]) ||
        (pathStarts(p, ["/app/production/orders/new"]) &&
          (!orderType || orderType === "assembly")) ||
        (pathStarts(p, ["/app/production/issue-station", "/app/production/receive-station"]) &&
          new URLSearchParams(loc.search).get("mode") !== "disassembly" &&
          new URLSearchParams(loc.search).get("mode") !== "recipe")
      );
    }
    if (area.id === "production_disassembly") {
      return (
        pathStarts(p, ["/app/production/disassembly/jobs", "/app/production/disassembly/recipes"]) ||
        pathStarts(p, ["/app/production/weigh-parts"]) ||
        (pathStarts(p, ["/app/production/orders/new"]) &&
          ["cutting", "disassembly"].includes(new URLSearchParams(loc.search).get("type") ?? "")) ||
        (pathStarts(p, ["/app/production/issue-station", "/app/production/receive-station"]) &&
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
      const norm = p.replace(/\/$/, "");
      return norm === "/app/sales" || norm === "/app/selling";
    }
    if (area.id === "sales_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/sales" || norm === "/app/selling";
    }
    if (area.id === "sales_list") {
      const norm = p.replace(/\/$/, "");
      const view = new URLSearchParams(loc.search).get("view");
      return (
        (norm === "/app/sales/sales" || (p.startsWith("/app/sales/sales/") && !p.startsWith("/app/sales/sales/new"))) &&
        !view
      );
    }
    if (area.id === "sales_outstanding") {
      return (
        (p === "/app/sales/sales" || p === "/app/sales/sales/") &&
        new URLSearchParams(loc.search).get("view") === "status"
      );
    }
    if (area.id === "sales_history") {
      return (
        (p === "/app/sales/sales" || p === "/app/sales/sales/") &&
        new URLSearchParams(loc.search).get("view") === "history"
      );
    }
    if (area.id === "customers") {
      const kind = new URLSearchParams(loc.search).get("kind");
      return pathStarts(p, ["/app/inventory/partners"]) && kind !== "vendor";
    }
    if (area.id === "quotation") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/quotation";
    }
    if (area.id === "quotation_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/quotation";
    }
    if (area.id === "quotation_list") {
      const view = new URLSearchParams(loc.search).get("view");
      return (
        (p === "/app/quotation/quotations" || p === "/app/quotation/quotations/") &&
        !view
      );
    }
    if (area.id === "quotation_new") {
      return pathStarts(p, ["/app/quotation/quotations/new"]);
    }
    if (area.id === "quotation_outstanding") {
      return (
        (p === "/app/quotation/quotations" || p === "/app/quotation/quotations/") &&
        new URLSearchParams(loc.search).get("view") === "outstanding"
      );
    }
    if (area.id === "quotation_history") {
      return (
        (p === "/app/quotation/quotations" || p === "/app/quotation/quotations/") &&
        new URLSearchParams(loc.search).get("view") === "status"
      );
    }
    if (area.id === "sales_order") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/sales-order";
    }
    if (area.id === "sales_order_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/sales-order";
    }
    if (area.id === "sales_order_list") {
      const view = new URLSearchParams(loc.search).get("view");
      return (
        (p === "/app/sales-order/sales-orders" || p === "/app/sales-order/sales-orders/") &&
        !view
      );
    }
    if (area.id === "sales_order_new") {
      return pathStarts(p, ["/app/sales-order/sales-orders/new"]);
    }
    if (area.id === "sales_order_outstanding") {
      return (
        (p === "/app/sales-order/sales-orders" || p === "/app/sales-order/sales-orders/") &&
        new URLSearchParams(loc.search).get("view") === "outstanding"
      );
    }
    if (area.id === "sales_order_history") {
      return (
        (p === "/app/sales-order/sales-orders" || p === "/app/sales-order/sales-orders/") &&
        new URLSearchParams(loc.search).get("view") === "status"
      );
    }
    if (area.id === "accounts_receivable") {
      return (
        pathStarts(p, ["/app/finance/receivables"]) ||
        p === "/app/sales/reports/ar-by-customer" ||
        p.startsWith("/app/selling/reports/receivable-status")
      );
    }
    if (area.id === "sales") {
      return pathStarts(p, ["/app/sales/sales/new"]);
    }
    if (area.id === "credit_notes") {
      return pathStarts(p, ["/app/sales/credit-notes"]);
    }
    if (area.id === "sales_invoices") {
      return (
        pathStarts(p, [
          "/app/sales/retainer-invoices",
          "/app/sales/recurring-invoices",
          "/app/sales/collective-invoicing",
        ])
      );
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
      const norm = p.replace(/\/$/, "");
      return norm === "/app/purchases" || norm === "/app/buying";
    }
    if (area.id === "purchase_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/purchases" || norm === "/app/buying";
    }
    if (area.id === "purchase_receive_list") {
      const norm = p.replace(/\/$/, "");
      const view = new URLSearchParams(loc.search).get("view");
      return (
        (norm === "/app/purchases/purchase-receive" ||
          (p.startsWith("/app/purchases/purchase-receive/") &&
            !p.startsWith("/app/purchases/purchase-receive/new") &&
            !p.startsWith("/app/purchases/purchase-receive/settings") &&
            !p.startsWith("/app/purchases/purchase-receive/pre-invoicing") &&
            !p.startsWith("/app/purchases/purchase-receive/payment-status") &&
            !p.startsWith("/app/purchases/purchase-receive/ap-by-vendor"))) &&
        !view
      );
    }
    if (area.id === "purchase_outstanding") {
      return (
        (p === "/app/purchases/purchase-receive" || p === "/app/purchases/purchase-receive/") &&
        new URLSearchParams(loc.search).get("view") === "status"
      );
    }
    if (area.id === "purchase_history") {
      return (
        (p === "/app/purchases/purchase-receive" || p === "/app/purchases/purchase-receive/") &&
        new URLSearchParams(loc.search).get("view") === "history"
      );
    }
    if (area.id === "vendors") {
      return pathStarts(p, ["/app/inventory/partners"]) && new URLSearchParams(loc.search).get("kind") === "vendor";
    }
    if (area.id === "rfq") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/rfq";
    }
    if (area.id === "rfq_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/rfq";
    }
    if (area.id === "rfq_list") {
      const view = new URLSearchParams(loc.search).get("view");
      const isNew =
        new URLSearchParams(loc.search).get("new") === "1" ||
        new URLSearchParams(loc.search).get("new") === "true";
      return (
        pathStarts(p, ["/app/purchase-order/rfq"]) &&
        !p.startsWith("/app/purchase-order/rfq/") &&
        !view &&
        !isNew
      );
    }
    if (area.id === "rfq_outstanding") {
      return (
        pathStarts(p, ["/app/purchase-order/rfq"]) &&
        !p.startsWith("/app/purchase-order/rfq/") &&
        new URLSearchParams(loc.search).get("view") === "outstanding"
      );
    }
    if (area.id === "rfq_history") {
      return (
        pathStarts(p, ["/app/purchase-order/rfq"]) &&
        !p.startsWith("/app/purchase-order/rfq/") &&
        new URLSearchParams(loc.search).get("view") === "history"
      );
    }
    if (area.id === "rfq_new") {
      return (
        pathStarts(p, ["/app/purchase-order/rfq"]) &&
        !p.startsWith("/app/purchase-order/rfq/") &&
        (new URLSearchParams(loc.search).get("new") === "1" ||
          new URLSearchParams(loc.search).get("new") === "true")
      );
    }
    if (area.id === "purchase_request") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/purchase-request";
    }
    if (area.id === "purchase_request_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/purchase-request";
    }
    if (area.id === "purchase_request_list") {
      return (
        p === "/app/purchase-request/purchase-requests" ||
        p === "/app/purchase-request/purchase-requests/"
      );
    }
    if (area.id === "purchase_request_new") {
      return pathStarts(p, ["/app/purchase-request/purchase-requests/new"]);
    }
    if (area.id === "purchase_request_outstanding") {
      return (
        pathStarts(p, ["/app/purchase-request/purchase-requests/status"]) &&
        new URLSearchParams(loc.search).get("view") !== "history"
      );
    }
    if (area.id === "purchase_request_history") {
      return (
        pathStarts(p, ["/app/purchase-request/purchase-requests/status"]) &&
        new URLSearchParams(loc.search).get("view") === "history"
      );
    }
    if (area.id === "purchase_rfq") {
      return pathStarts(p, ["/app/purchase-order/rfq"]);
    }
    if (area.id === "purchase_order") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/purchase-order";
    }
    if (area.id === "purchase_order_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/purchase-order";
    }
    if (area.id === "purchase_order_list") {
      const view = new URLSearchParams(loc.search).get("view");
      const isNew =
        new URLSearchParams(loc.search).get("new") === "1" ||
        new URLSearchParams(loc.search).get("new") === "true";
      return (
        (p === "/app/purchase-order/purchase-orders" || p === "/app/purchase-order/purchase-orders/") &&
        !view &&
        !isNew
      );
    }
    if (area.id === "purchase_order_new") {
      return (
        (p === "/app/purchase-order/purchase-orders" || p === "/app/purchase-order/purchase-orders/") &&
        (new URLSearchParams(loc.search).get("new") === "1" ||
          new URLSearchParams(loc.search).get("new") === "true")
      );
    }
    if (area.id === "purchase_order_outstanding") {
      return (
        (p === "/app/purchase-order/purchase-orders" || p === "/app/purchase-order/purchase-orders/") &&
        new URLSearchParams(loc.search).get("view") === "outstanding"
      );
    }
    if (area.id === "purchase_order_history") {
      return (
        (p === "/app/purchase-order/purchase-orders" || p === "/app/purchase-order/purchase-orders/") &&
        new URLSearchParams(loc.search).get("view") === "status"
      );
    }
    if (area.id === "expense") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/expenses";
    }
    if (area.id === "expense_overview") {
      const norm = p.replace(/\/$/, "");
      return norm === "/app/expenses";
    }
    if (area.id === "purchase_expenses") {
      return pathStarts(p, ["/app/purchases/expenses", "/app/purchases/recurring-expenses"]);
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
      return (
        pathStarts(p, ["/app/finance/payables"]) ||
        p === "/app/purchases/purchase-receive/ap-by-vendor" ||
        p.startsWith("/app/purchases/purchase-receive/ap-by-vendor/")
      );
    }
    if (area.id === "purchases") {
      return pathStarts(p, ["/app/purchases/purchase-receive/new", "/app/purchases/purchases/new"]);
    }
    if (area.id === "buying") {
      return pathStarts(p, ["/app/buying"]);
    }
    if (area.id === "accounting") {
      return p === "/app/finance" || p === "/app/finance/";
    }
    if (area.id === "bookkeeping") {
      return (
        pathStarts(p, ["/app/finance/bookkeeping"]) ||
        (pathStarts(p, ["/app/finance/acct-i"]) &&
          !p.startsWith("/app/finance/acct-i/journal-entries") &&
          !p.startsWith("/app/finance/acct-i/reports"))
      );
    }
    if (area.id === "ledger") {
      return pathStarts(p, [
        "/app/finance/acct-i/journal-entries",
        "/app/finance/journal-entries",
        "/app/finance/official-receipts",
      ]);
    }
    if (area.id === "cash") {
      return pathStarts(p, ["/app/finance/receivables", "/app/finance/collections"]);
    }
    if (area.id === "disbursements") {
      return (
        pathStarts(p, [
          "/app/finance/payables",
          "/app/finance/disbursements",
          "/app/finance/payment-vouchers",
          "/app/finance/acct-ii",
        ]) && !p.startsWith("/app/finance/banking")
      );
    }
    if (area.id === "banking") {
      return pathStarts(p, ["/app/finance/banking"]);
    }
    if (area.id === "ar_aging") {
      return pathStarts(p, ["/app/finance/reports/ar-aging"]);
    }
    if (area.id === "ap_aging") {
      return pathStarts(p, ["/app/finance/reports/ap-aging"]);
    }
    if (area.id === "profit_and_loss") {
      return pathStarts(p, ["/app/finance/acct-i/reports/profit-and-loss", "/app/finance/reports/profit-and-loss"]);
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
        (pathStarts(p, ["/app/user-management"]) ||
          pathStarts(p, ["/app/settings/branding"]) ||
          pathStarts(p, ["/app/settings/billing"])) &&
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
      <For each={sidebarAreas()}>
        {(area) => (
          <Show
            when={area.kind === "separator"}
            fallback={
              <Show when={areaEnabled(area, auth.me)}>
                <HomeAreaBlock
                  area={area}
                  active={homeActive}
                  childrenOf={childrenOf}
                  badgeCount={area.id === "comms" ? chatUnread.unreadTotal() : undefined}
                />
              </Show>
            }
          >
            <div
              class="mx-2 my-2 border-t border-stroke"
              classList={{ "mx-1": shell.collapsed() }}
              role="separator"
              aria-hidden="true"
            />
          </Show>
        )}
      </For>
    </nav>
  );
}
