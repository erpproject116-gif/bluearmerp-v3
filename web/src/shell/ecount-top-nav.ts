/** Top strip areas + path → module resolution for shell IA (Gate G4).
 * Labels are process-oriented (not Ecount Inv. I / Acct. I jargon). */

export type EcountTopId = "mypage" | "inv1" | "inv2" | "acct1" | "acct2" | "setup" | "more";

export type EcountTopModule = {
  id: EcountTopId;
  label: string;
  /** Short hint for title/tooltip */
  hint?: string;
  /** Default landing when the strip is clicked */
  href: string;
  /** Sidebar navGroup ids visible under this top module */
  navGroupIds: string[];
  /** Also show these ungrouped module ids */
  ungroupedModuleIds?: string[];
};

export const ECOUNT_TOP_MODULES: EcountTopModule[] = [
  {
    id: "mypage",
    label: "Home",
    hint: "Dashboard and Site Map",
    href: "/app/dashboard",
    navGroupIds: [],
    ungroupedModuleIds: ["dashboard"],
  },
  {
    id: "inv1",
    label: "Operations",
    hint: "Stock, sell, and buy documents",
    href: "/app/inventory/items",
    navGroupIds: ["stocks_management", "sales_process", "procurement_process"],
  },
  {
    id: "inv2",
    label: "Warehouse",
    hint: "Serial/lot and WMS under Stocks",
    href: "/app/inventory/serial-lot",
    // Warehouse lives under Stocks — show the full Stock group.
    navGroupIds: ["stocks_management"],
  },
  {
    id: "acct1",
    label: "Ledger",
    hint: "General ledger and taxes",
    href: "/app/finance/acct-i/journal-entries",
    navGroupIds: ["accounting_dept"],
  },
  {
    id: "acct2",
    label: "Cash & AR/AP",
    hint: "Collections, disbursements, checks",
    href: "/app/finance/collections",
    navGroupIds: ["accounting_dept"],
  },
  {
    id: "setup",
    label: "Setup",
    hint: "Users, branding, help",
    href: "/app/user-management",
    navGroupIds: ["misc"],
  },
  {
    id: "more",
    label: "More",
    hint: "CRM, POS, HR, and other apps",
    href: "/app/crm/dashboard",
    navGroupIds: ["more_apps"],
  },
];

const STORAGE_KEY = "bluearm-ecount-top-module";

export function readStoredEcountTop(): EcountTopId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as EcountTopId | null;
    if (v && ECOUNT_TOP_MODULES.some((m) => m.id === v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredEcountTop(id: EcountTopId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Infer top module from current path (overrides stale localStorage when navigating). */
export function resolveEcountTopFromPath(pathname: string): EcountTopId {
  if (pathname.startsWith("/app/dashboard")) return "mypage";
  if (
    pathname.startsWith("/app/inventory/serial-lot") ||
    pathname.startsWith("/app/inventory/wms") ||
    pathname.includes("/serial-lot") ||
    pathname.startsWith("/app/quality")
  ) {
    return "inv2";
  }
  if (
    pathname.startsWith("/app/finance/acct-i") ||
    pathname.startsWith("/app/finance/journal") ||
    pathname.startsWith("/app/finance/official-receipts") ||
    pathname.startsWith("/app/finance/reports")
  ) {
    return "acct1";
  }
  if (
    pathname.startsWith("/app/finance/acct-ii") ||
    pathname.startsWith("/app/finance/collections") ||
    pathname.startsWith("/app/finance/disbursements") ||
    pathname.startsWith("/app/finance/payment-vouchers") ||
    pathname.startsWith("/app/purchases/expenses")
  ) {
    return "acct2";
  }
  if (
    pathname.startsWith("/app/user-management") ||
    pathname.startsWith("/app/activity-logs") ||
    pathname.startsWith("/app/documentation") ||
    pathname.startsWith("/app/branding")
  ) {
    return "setup";
  }
  if (
    pathname.startsWith("/app/crm") ||
    pathname.startsWith("/app/pos") ||
    pathname.startsWith("/app/hr") ||
    pathname.startsWith("/app/operations") ||
    pathname.startsWith("/app/sop") ||
    pathname.startsWith("/app/okr") ||
    pathname.startsWith("/app/booking") ||
    pathname.startsWith("/app/comms") ||
    pathname.startsWith("/app/support") ||
    pathname.startsWith("/app/reports")
  ) {
    return "more";
  }
  if (
    pathname.startsWith("/app/inventory") ||
    pathname.startsWith("/app/selling") ||
    pathname.startsWith("/app/sales") ||
    pathname.startsWith("/app/quotation") ||
    pathname.startsWith("/app/sales-order") ||
    pathname.startsWith("/app/buying") ||
    pathname.startsWith("/app/purchase") ||
    pathname.startsWith("/app/purchases") ||
    pathname.startsWith("/app/after-sales") ||
    pathname.startsWith("/app/job-costing")
  ) {
    return "inv1";
  }
  if (pathname.startsWith("/app/finance")) return "acct1";
  return readStoredEcountTop() ?? "mypage";
}

export function ecountTopById(id: EcountTopId): EcountTopModule {
  return ECOUNT_TOP_MODULES.find((m) => m.id === id) ?? ECOUNT_TOP_MODULES[0]!;
}

/** Home sidebar: vertical area stack (replaces the horizontal module strip). */
export type HomeSidebarArea = {
  id: string;
  label: string;
  href: string;
  iconId: string;
  /** Optional top-module id for storage hint; path resolution still wins. */
  topId?: EcountTopId;
  /** Expand this nav group after navigate. */
  expandGroupId?: string;
  /** Nested links shown under this area on Home (e.g. Warehouse under Stocks). */
  children?: HomeSidebarArea[];
  /** When children exist, whether the group starts expanded (default true). */
  defaultExpanded?: boolean;
};

export const HOME_SIDEBAR_AREAS: HomeSidebarArea[] = [
  { id: "home", label: "Home", href: "/app/dashboard", iconId: "dashboard", topId: "mypage" },
  {
    id: "stocks",
    label: "Stocks",
    href: "/app/inventory",
    iconId: "inventory",
    topId: "inv1",
    expandGroupId: "stocks_management",
    defaultExpanded: false,
    children: [
      {
        id: "inventory",
        label: "Inventory",
        href: "/app/inventory",
        iconId: "inventory",
        topId: "inv1",
        expandGroupId: "stocks_management",
      },
      {
        id: "after_sales",
        label: "After-Sales",
        href: "/app/after-sales/repair-orders",
        iconId: "after_sales",
        topId: "inv1",
        expandGroupId: "stocks_management",
      },
      {
        id: "warehouse",
        label: "Warehouse",
        href: "/app/inventory/wms/scheduled-receipts",
        iconId: "sub_warehouse",
        topId: "inv2",
        expandGroupId: "stocks_management",
      },
      {
        id: "serial_lot",
        label: "Serial / Lot",
        href: "/app/inventory/serial-lot/registry",
        iconId: "sub_serial_lot",
        topId: "inv2",
        expandGroupId: "stocks_management",
      },
    ],
  },
  {
    id: "sell",
    label: "Sell",
    href: "/app/quotation/quotations",
    iconId: "selling",
    topId: "inv1",
    expandGroupId: "sales_process",
    children: [
      {
        id: "quotation",
        label: "Quotation",
        href: "/app/quotation/quotations",
        iconId: "quotation",
        topId: "inv1",
        expandGroupId: "sales_process",
      },
      {
        id: "sales_order",
        label: "Sales Order",
        href: "/app/sales-order/sales-orders",
        iconId: "sales_order",
        topId: "inv1",
        expandGroupId: "sales_process",
      },
      {
        id: "sales",
        label: "Sales invoices",
        href: "/app/sales/sales",
        iconId: "sales",
        topId: "inv1",
        expandGroupId: "sales_process",
      },
      {
        id: "combined_invoices",
        label: "Combined invoices",
        href: "/app/sales/collective-invoicing/list",
        iconId: "sub_combined_invoices",
        topId: "inv1",
        expandGroupId: "sales_process",
      },
      {
        id: "selling",
        label: "Sell overview",
        href: "/app/selling",
        iconId: "selling",
        topId: "inv1",
        expandGroupId: "sales_process",
      },
    ],
  },
  {
    id: "buy",
    label: "Buy",
    href: "/app/purchase-request/purchase-requests",
    iconId: "buying",
    topId: "inv1",
    expandGroupId: "procurement_process",
    children: [
      {
        id: "purchase_request",
        label: "Purchase Request",
        href: "/app/purchase-request/purchase-requests",
        iconId: "purchase_request",
        topId: "inv1",
        expandGroupId: "procurement_process",
      },
      {
        id: "purchase_order",
        label: "Purchase Order",
        href: "/app/purchase-order/purchase-orders",
        iconId: "purchase_order",
        topId: "inv1",
        expandGroupId: "procurement_process",
      },
      {
        id: "purchases",
        label: "Purchase invoices",
        href: "/app/purchases/purchases",
        iconId: "purchases",
        topId: "inv1",
        expandGroupId: "procurement_process",
      },
      {
        id: "buying",
        label: "Buy overview",
        href: "/app/buying",
        iconId: "buying",
        topId: "inv1",
        expandGroupId: "procurement_process",
      },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    href: "/app/finance",
    iconId: "finance",
    topId: "acct1",
    expandGroupId: "accounting_dept",
    children: [
      {
        id: "ledger",
        label: "Ledger",
        href: "/app/finance/acct-i/journal-entries",
        iconId: "sub_general_ledger",
        topId: "acct1",
        expandGroupId: "accounting_dept",
      },
      {
        id: "cash",
        label: "Cash & AR/AP",
        href: "/app/finance/collections",
        iconId: "sub_ar_ap",
        topId: "acct2",
        expandGroupId: "accounting_dept",
      },
    ],
  },
  { id: "more", label: "More Apps", href: "/app/crm/dashboard", iconId: "more_apps", topId: "more" },
  {
    id: "setup",
    label: "Setup",
    href: "/app/user-management",
    iconId: "setup",
    topId: "setup",
    expandGroupId: "misc",
  },
  { id: "sitemap", label: "Site Map", href: "/app/dashboard/site-map", iconId: "dashboard", topId: "mypage" },
];
