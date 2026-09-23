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
    hint: "Dashboard",
    href: "/app/dashboard",
    navGroupIds: [],
    ungroupedModuleIds: ["dashboard"],
  },
  {
    id: "inv1",
    label: "Operations",
    hint: "Inventory, selling, and buying — not project management",
    href: "/app/inventory",
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
    hint: "Collections, disbursements, bookkeeping",
    href: "/app/finance/bookkeeping",
    navGroupIds: ["accounting_dept"],
  },
  {
    id: "setup",
    label: "Setup",
    hint: "Users, branding, billing, help",
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
    pathname.startsWith("/app/finance/acct-i/journal-entries") ||
    pathname.startsWith("/app/finance/journal-entries") ||
    pathname.startsWith("/app/finance/official-receipts") ||
    pathname.startsWith("/app/finance/reports")
  ) {
    return "acct1";
  }
  if (
    pathname.startsWith("/app/finance/acct-ii") ||
    pathname.startsWith("/app/finance/receivables") ||
    pathname.startsWith("/app/finance/payables") ||
    pathname.startsWith("/app/finance/collections") ||
    pathname.startsWith("/app/finance/bookkeeping") ||
    pathname.startsWith("/app/finance/disbursements") ||
    pathname.startsWith("/app/finance/payment-vouchers") ||
    pathname.startsWith("/app/finance/banking") ||
    pathname.startsWith("/app/purchases/expenses") ||
    pathname.startsWith("/app/purchases/recurring-expenses") ||
    pathname.startsWith("/app/purchases/vendor-credits")
  ) {
    return "acct2";
  }
  if (
    pathname.startsWith("/app/user-management") ||
    pathname.startsWith("/app/activity-logs") ||
    pathname.startsWith("/app/documentation") ||
    pathname.startsWith("/app/settings/branding") ||
    pathname.startsWith("/app/settings/billing")
  ) {
    return "setup";
  }
  if (
    pathname.startsWith("/app/crm") ||
    pathname.startsWith("/app/pos") ||
    pathname.startsWith("/app/hr") ||
    pathname.startsWith("/app/operations") ||
    pathname.startsWith("/app/sop") ||
    pathname.startsWith("/app/cms") ||
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
    pathname.startsWith("/app/purchase-request") ||
    pathname.startsWith("/app/purchase-order") ||
    pathname.startsWith("/app/purchases") ||
    pathname.startsWith("/app/rfq") ||
    pathname.startsWith("/app/expenses") ||
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
  /** Visual rule between nav groups (no link). */
  kind?: "link" | "separator";
  /** Optional top-module id for storage hint; path resolution still wins. */
  topId?: EcountTopId;
  /** Expand this nav group after navigate. */
  expandGroupId?: string;
  /** Nested links shown under this area on Home (e.g. Warehouse under Stocks). */
  children?: HomeSidebarArea[];
  /** When children exist, whether the group starts expanded (default true). */
  defaultExpanded?: boolean;
  /** Tenant module id for enablement gating (sidebar children). */
  moduleId?: string;
  /** Optional short tooltip / secondary label for buy-path clarity. */
  hint?: string;
};

export const HOME_SIDEBAR_AREAS: HomeSidebarArea[] = [
  { id: "home", label: "Home", href: "/app/dashboard", iconId: "dashboard", topId: "mypage" },
  { id: "reports_home", label: "Reports", href: "/app/reports", iconId: "reports", topId: "more", moduleId: "reports", expandGroupId: "more_apps" },
  {
    id: "stocks",
    label: "Stocks",
    href: "/app/inventory",
    iconId: "stocks",
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
    ],
  },
  {
    id: "production",
    label: "Manufacturing",
    href: "/app/production",
    iconId: "manufacturing",
    topId: "inv1",
    expandGroupId: "production_process",
    moduleId: "production",
    defaultExpanded: false,
    children: [
      {
        id: "production_workflow",
        label: "Dashboard",
        href: "/app/production",
        iconId: "overview",
        topId: "inv1",
        expandGroupId: "production_process",
        moduleId: "production",
      },
      {
        id: "production_all",
        label: "All jobs",
        href: "/app/production/all/jobs",
        iconId: "production_wo",
        topId: "inv1",
        expandGroupId: "production_process",
        moduleId: "production",
      },
      {
        id: "production_assembly",
        label: "Assembly",
        href: "/app/production/assembly/recipes",
        iconId: "production_assembly",
        topId: "inv1",
        expandGroupId: "production_process",
        moduleId: "production",
      },
      {
        id: "production_disassembly",
        label: "Cutting",
        href: "/app/production/disassembly/recipes",
        iconId: "production_cutting",
        topId: "inv1",
        expandGroupId: "production_process",
        moduleId: "production",
      },
      {
        id: "production_reports",
        label: "Reports",
        href: "/app/production/reports",
        iconId: "reports",
        topId: "inv1",
        expandGroupId: "production_process",
        moduleId: "production",
      },
      {
        id: "production_waste",
        label: "Waste & variance",
        href: "/app/production/reports?tab=waste-variance",
        iconId: "reports",
        topId: "inv1",
        expandGroupId: "production_process",
        moduleId: "production",
      },
      {
        id: "production_setup",
        label: "Setup",
        href: "/app/production/setup",
        iconId: "setup",
        topId: "inv1",
        expandGroupId: "production_process",
        moduleId: "production",
      },
    ],
  },
  { id: "sep_after_manufacturing", label: "", href: "#", iconId: "overview", kind: "separator" },
  {
    id: "sales_process",
    label: "Sales",
    href: "/app/quotation",
    iconId: "sales_process",
    topId: "inv1",
    expandGroupId: "sales_process",
    defaultExpanded: false,
    children: [
      {
        id: "quotation",
        label: "Quotation",
        href: "/app/quotation",
        iconId: "quotation",
        topId: "inv1",
        expandGroupId: "sales_process",
        moduleId: "quotation",
        defaultExpanded: false,
        children: [
          {
            id: "quotation_overview",
            label: "Quotation Overview",
            href: "/app/quotation",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "quotation",
          },
          {
            id: "quotation_list",
            label: "Quotation list",
            href: "/app/quotation/quotations",
            iconId: "doc_list",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "quotation",
          },
          {
            id: "quotation_new",
            label: "New quotation",
            href: "/app/quotation/quotations/new",
            iconId: "doc_new",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "quotation",
          },
          {
            id: "quotation_outstanding",
            label: "Outstanding quotation",
            href: "/app/quotation/quotations?view=outstanding",
            iconId: "doc_outstanding",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "quotation",
          },
          {
            id: "quotation_history",
            label: "Quotation History",
            href: "/app/quotation/quotations?view=status",
            iconId: "doc_history",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "quotation",
          },
        ],
      },
      {
        id: "sales_order",
        label: "Sales Order",
        href: "/app/sales-order",
        iconId: "sales_order",
        topId: "inv1",
        expandGroupId: "sales_process",
        moduleId: "sales_order",
        defaultExpanded: false,
        children: [
          {
            id: "sales_order_overview",
            label: "S.O. Overview",
            href: "/app/sales-order",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales_order",
          },
          {
            id: "sales_order_list",
            label: "Sales Order list",
            href: "/app/sales-order/sales-orders",
            iconId: "doc_list",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales_order",
          },
          {
            id: "sales_order_new",
            label: "New Sales Order",
            href: "/app/sales-order/sales-orders/new",
            iconId: "doc_new",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales_order",
          },
          {
            id: "sales_order_outstanding",
            label: "Outstanding Sales Order",
            href: "/app/sales-order/sales-orders?view=outstanding",
            iconId: "doc_outstanding",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales_order",
          },
          {
            id: "sales_order_history",
            label: "S.O. History",
            href: "/app/sales-order/sales-orders?view=status",
            iconId: "doc_history",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales_order",
          },
        ],
      },
      {
        id: "sell",
        label: "Sales",
        href: "/app/sales",
        iconId: "selling",
        topId: "inv1",
        expandGroupId: "sales_process",
        defaultExpanded: false,
        children: [
          {
            id: "sales_overview",
            label: "Sales Overview",
            href: "/app/sales",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
          {
            id: "sales_list",
            label: "Sales list",
            href: "/app/sales/sales",
            iconId: "doc_list",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
          {
            id: "sales",
            label: "New sales",
            href: "/app/sales/sales/new",
            iconId: "doc_new",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
          {
            id: "sales_outstanding",
            label: "Outstanding sales",
            href: "/app/sales/sales?view=status",
            iconId: "doc_outstanding",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
          {
            id: "sales_history",
            label: "Sales History",
            href: "/app/sales/sales?view=history",
            iconId: "doc_history",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
        ],
      },
      {
        id: "sales_invoices",
        label: "Other Invoices",
        href: "/app/sales/retainer-invoices",
        iconId: "sub_combined_invoices",
        topId: "inv1",
        expandGroupId: "sales_process",
        moduleId: "sales",
        defaultExpanded: false,
        children: [
          {
            id: "retainer_invoices",
            label: "Retainer Invoice",
            href: "/app/sales/retainer-invoices",
            iconId: "retainer_invoice",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
          {
            id: "recurring_invoices",
            label: "Recurring Invoice",
            href: "/app/sales/recurring-invoices",
            iconId: "recurring_invoice",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
          {
            id: "combined_invoices",
            label: "Combined Invoice",
            href: "/app/sales/collective-invoicing/list",
            iconId: "sales",
            topId: "inv1",
            expandGroupId: "sales_process",
            moduleId: "sales",
          },
        ],
      },
      {
        id: "credit_notes",
        label: "Credit Notes",
        href: "/app/sales/credit-notes",
        iconId: "credit_note",
        topId: "inv1",
        expandGroupId: "sales_process",
        moduleId: "sales",
      },
      {
        id: "customers",
        label: "Customers",
        href: "/app/inventory/partners?kind=customer",
        iconId: "customers",
        topId: "inv1",
        expandGroupId: "sales_process",
        moduleId: "inventory",
      },
      {
        id: "accounts_receivable",
        label: "Accounts Receivable",
        href: "/app/finance/receivables",
        iconId: "accounts_receivable",
        topId: "inv1",
        expandGroupId: "sales_process",
        moduleId: "sales",
        hint: "New Receivable Payment — collect open balances",
      },
    ],
  },
  {
    id: "purchase_process",
    label: "Purchase",
    href: "/app/rfq",
    iconId: "purchase_process",
    topId: "inv1",
    expandGroupId: "procurement_process",
    defaultExpanded: false,
    children: [
      {
        id: "rfq",
        label: "RFQ",
        href: "/app/rfq",
        iconId: "rfq",
        topId: "inv1",
        expandGroupId: "procurement_process",
        moduleId: "purchase_order",
        defaultExpanded: false,
        children: [
          {
            id: "rfq_overview",
            label: "RFQ Overview",
            href: "/app/rfq",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "rfq_list",
            label: "RFQ list",
            href: "/app/purchase-order/rfq",
            iconId: "doc_list",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "rfq_new",
            label: "New RFQ",
            href: "/app/purchase-order/rfq?new=1",
            iconId: "doc_new",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "rfq_outstanding",
            label: "Outstanding RFQ",
            href: "/app/purchase-order/rfq?view=outstanding",
            iconId: "doc_outstanding",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "rfq_history",
            label: "RFQ History",
            href: "/app/purchase-order/rfq?view=history",
            iconId: "doc_history",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
        ],
      },
      {
        id: "purchase_request",
        label: "Purchase Request",
        href: "/app/purchase-request",
        iconId: "purchase_request",
        topId: "inv1",
        expandGroupId: "procurement_process",
        moduleId: "purchase_request",
        defaultExpanded: false,
        children: [
          {
            id: "purchase_request_overview",
            label: "P.R. Overview",
            href: "/app/purchase-request",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_request",
          },
          {
            id: "purchase_request_list",
            label: "P.R. list",
            href: "/app/purchase-request/purchase-requests",
            iconId: "doc_list",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_request",
          },
          {
            id: "purchase_request_new",
            label: "New P.R.",
            href: "/app/purchase-request/purchase-requests/new",
            iconId: "doc_new",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_request",
          },
          {
            id: "purchase_request_outstanding",
            label: "Outstanding P.R.",
            href: "/app/purchase-request/purchase-requests/status",
            iconId: "doc_outstanding",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_request",
          },
          {
            id: "purchase_request_history",
            label: "P.R. History",
            href: "/app/purchase-request/purchase-requests/status?view=history",
            iconId: "doc_history",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_request",
          },
        ],
      },
      {
        id: "purchase_order",
        label: "Purchase Order",
        href: "/app/purchase-order",
        iconId: "purchase_order",
        topId: "inv1",
        expandGroupId: "procurement_process",
        moduleId: "purchase_order",
        defaultExpanded: false,
        children: [
          {
            id: "purchase_order_overview",
            label: "P.O. Overview",
            href: "/app/purchase-order",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "purchase_order_list",
            label: "P.O. list",
            href: "/app/purchase-order/purchase-orders",
            iconId: "doc_list",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "purchase_order_new",
            label: "New P.O.",
            href: "/app/purchase-order/purchase-orders?new=1",
            iconId: "doc_new",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "purchase_order_outstanding",
            label: "Outstanding P.O.",
            href: "/app/purchase-order/purchase-orders?view=outstanding",
            iconId: "doc_outstanding",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
          {
            id: "purchase_order_history",
            label: "P.O. History",
            href: "/app/purchase-order/purchase-orders?view=status",
            iconId: "doc_history",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchase_order",
          },
        ],
      },
      {
        id: "buy",
        label: "Purchase Receive",
        href: "/app/purchases",
        iconId: "buying",
        topId: "inv1",
        expandGroupId: "procurement_process",
        defaultExpanded: false,
        children: [
          {
            id: "purchase_overview",
            label: "Purchase Overview",
            href: "/app/purchases",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
          },
          {
            id: "purchase_receive_list",
            label: "Purchase list",
            href: "/app/purchases/purchase-receive",
            iconId: "doc_list",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
          },
          {
            id: "purchases",
            label: "New Purchase",
            href: "/app/purchases/purchase-receive/new",
            iconId: "doc_new",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
            hint: "Receive stock and bill the supplier — Find Stock updates when items track inventory",
          },
          {
            id: "purchase_outstanding",
            label: "Outstanding Purchase",
            href: "/app/purchases/purchase-receive?view=status",
            iconId: "doc_outstanding",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
          },
          {
            id: "purchase_history",
            label: "Purchase History",
            href: "/app/purchases/purchase-receive?view=history",
            iconId: "doc_history",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
          },
        ],
      },
      {
        id: "expense",
        label: "Expense",
        href: "/app/expenses",
        iconId: "expenses",
        topId: "inv1",
        expandGroupId: "procurement_process",
        moduleId: "purchases",
        defaultExpanded: false,
        children: [
          {
            id: "expense_overview",
            label: "Expense Overview",
            href: "/app/expenses",
            iconId: "overview",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
          },
          {
            id: "expenses",
            label: "Expenses",
            href: "/app/purchases/expenses",
            iconId: "expenses",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
          },
          {
            id: "recurring_expenses",
            label: "Recurring Expenses",
            href: "/app/purchases/recurring-expenses",
            iconId: "recurring_expense",
            topId: "inv1",
            expandGroupId: "procurement_process",
            moduleId: "purchases",
          },
        ],
      },
      {
        id: "vendors",
        label: "Vendors",
        href: "/app/inventory/partners?kind=vendor",
        iconId: "vendors",
        topId: "inv1",
        expandGroupId: "procurement_process",
        moduleId: "inventory",
      },
      {
        id: "vendor_credits",
        label: "Vendor Credits",
        href: "/app/purchases/vendor-credits",
        iconId: "vendor_credit",
        topId: "inv1",
        expandGroupId: "procurement_process",
        moduleId: "purchases",
      },
      {
        id: "accounts_payable",
        label: "Accounts Payable",
        href: "/app/finance/payables",
        iconId: "accounts_payable",
        topId: "inv1",
        expandGroupId: "procurement_process",
        moduleId: "purchases",
        hint: "New Payable Payment — pay open balances",
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
    defaultExpanded: false,
    children: [
      {
        id: "bookkeeping",
        label: "Bookkeeping",
        href: "/app/finance/bookkeeping",
        iconId: "bookkeeping",
        topId: "acct1",
        expandGroupId: "accounting_dept",
        moduleId: "finance",
      },
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
        label: "New Receivable Payment",
        href: "/app/finance/receivables",
        iconId: "collections",
        topId: "acct2",
        expandGroupId: "accounting_dept",
        moduleId: "finance",
        hint: "Open customer balances → collect",
      },
      {
        id: "disbursements",
        label: "New Payable Payment",
        href: "/app/finance/payables",
        iconId: "disbursements",
        topId: "acct2",
        expandGroupId: "accounting_dept",
        moduleId: "finance",
        hint: "Open vendor balances → pay",
      },
      {
        id: "banking",
        label: "Banking",
        href: "/app/finance/banking",
        iconId: "banking",
        topId: "acct2",
        moduleId: "finance",
        expandGroupId: "accounting_dept",
      },
      {
        id: "ar_aging",
        label: "A/R Aging",
        href: "/app/finance/reports/ar-aging",
        iconId: "ar_aging",
        topId: "acct2",
        expandGroupId: "accounting_dept",
        moduleId: "finance",
        hint: "Who owes us, and how long",
      },
      {
        id: "ap_aging",
        label: "A/P Aging",
        href: "/app/finance/reports/ap-aging",
        iconId: "ap_aging",
        topId: "acct2",
        expandGroupId: "accounting_dept",
        moduleId: "finance",
        hint: "What we still owe suppliers",
      },
      {
        id: "profit_and_loss",
        label: "Profit & Loss",
        href: "/app/finance/acct-i/reports/profit-and-loss",
        iconId: "profit_and_loss",
        topId: "acct1",
        expandGroupId: "accounting_dept",
        moduleId: "finance",
        hint: "Income and expenses for a period",
      },
      {
        id: "financial_insights",
        label: "Financial Insights",
        href: "/app/finance/acct-i/financial-insights",
        iconId: "profit_and_loss",
        topId: "acct1",
        expandGroupId: "accounting_dept",
        moduleId: "finance",
        hint: "Owner KPIs and period comparison from posted books",
      },
    ],
  },
  { id: "sep_before_more", label: "", href: "#", iconId: "overview", kind: "separator" },
  {
    id: "more",
    label: "More Apps",
    href: "/app/crm/dashboard",
    iconId: "more_apps",
    topId: "more",
    expandGroupId: "more_apps",
    defaultExpanded: false,
    children: [
      { id: "crm", label: "CRM", href: "/app/crm/dashboard", iconId: "crm", topId: "more", moduleId: "crm", expandGroupId: "more_apps" },
      { id: "booking", label: "Booking", href: "/app/booking/bookings", iconId: "booking", topId: "more", moduleId: "booking", expandGroupId: "more_apps" },
      { id: "comms", label: "Communications", href: "/app/comms/chat", iconId: "comms", topId: "more", moduleId: "comms", expandGroupId: "more_apps" },
      {
        id: "operations",
        label: "Project Management",
        hint: "Projects, tasks, and timelines — separate from the Operations strip above",
        href: "/app/operations",
        iconId: "operations",
        topId: "more",
        moduleId: "operations",
        expandGroupId: "more_apps",
      },
      { id: "sop", label: "SOP", href: "/app/sop", iconId: "sop", topId: "more", moduleId: "sop", expandGroupId: "more_apps" },
      { id: "cms", label: "Pages", href: "/app/cms", iconId: "cms", topId: "more", moduleId: "cms", expandGroupId: "more_apps" },
      { id: "okr", label: "OKRs", href: "/app/okr", iconId: "okr", topId: "more", moduleId: "okr", expandGroupId: "more_apps" },
      { id: "quality", label: "Quality", href: "/app/quality/ncrs", iconId: "quality", topId: "more", moduleId: "quality", expandGroupId: "more_apps" },
      { id: "reports", label: "Reports", href: "/app/reports", iconId: "reports", topId: "more", moduleId: "reports", expandGroupId: "more_apps" },
      { id: "support", label: "Support", href: "/app/support/tickets", iconId: "support", topId: "more", moduleId: "support", expandGroupId: "more_apps" },
      { id: "pos", label: "POS", href: "/app/pos", iconId: "pos", topId: "more", moduleId: "pos", expandGroupId: "more_apps" },
      { id: "hr", label: "HR & Payroll", href: "/app/hr/employees", iconId: "hr", topId: "more", moduleId: "hr", expandGroupId: "more_apps" },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    href: "/app/user-management/users",
    iconId: "setup",
    topId: "setup",
    expandGroupId: "misc",
    defaultExpanded: false,
    children: [
      {
        id: "activity_logs",
        label: "Activity Logs",
        href: "/app/activity-logs",
        iconId: "activity_logs",
        topId: "setup",
        moduleId: "activity_logs",
        expandGroupId: "misc",
      },
      {
        id: "documentation",
        label: "Help & guides",
        href: "/app/documentation",
        iconId: "documentation",
        topId: "setup",
        moduleId: "documentation",
        expandGroupId: "misc",
      },
      {
        id: "user_management",
        label: "User Management",
        href: "/app/user-management/users",
        iconId: "user_management",
        topId: "setup",
        moduleId: "user_management",
        expandGroupId: "misc",
      },
      {
        id: "process_policies",
        label: "Process Policies",
        href: "/app/user-management/process-policies",
        iconId: "process_policies",
        topId: "setup",
        moduleId: "user_management",
        expandGroupId: "misc",
      },
    ],
  },
];
