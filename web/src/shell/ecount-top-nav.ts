/** Ecount-style top modules + path → module resolution for shell IA (Gate G4). */

export type EcountTopId = "mypage" | "inv1" | "inv2" | "acct1" | "acct2" | "setup" | "more";

export type EcountTopModule = {
  id: EcountTopId;
  label: string;
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
    label: "MyPage",
    href: "/app/dashboard",
    navGroupIds: [],
    ungroupedModuleIds: ["dashboard"],
  },
  {
    id: "inv1",
    label: "Inv. I",
    href: "/app/inventory/items",
    navGroupIds: ["stocks_management", "sales_process", "procurement_process"],
  },
  {
    id: "inv2",
    label: "Inv. II",
    href: "/app/inventory/serial-lot",
    navGroupIds: ["stocks_management"],
  },
  {
    id: "acct1",
    label: "Acct. I",
    href: "/app/finance/acct-i/journal-entries",
    navGroupIds: ["accounting_dept"],
  },
  {
    id: "acct2",
    label: "Acct. II",
    href: "/app/finance/collections",
    navGroupIds: ["accounting_dept"],
  },
  {
    id: "setup",
    label: "Setup",
    href: "/app/user-management",
    navGroupIds: ["misc"],
  },
  {
    id: "more",
    label: "More",
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
