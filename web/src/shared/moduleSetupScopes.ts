/**
 * Per-module Setup hub scopes — which process rules belong on each module's Setup tab.
 * Keeps non-tech users inside the module instead of hunting User Management.
 */

export type ModuleSetupScope = {
  id: string;
  title: string;
  blurb: string;
  /** Process policy boolean keys shown on this hub. */
  policyKeys: string[];
  showBudgetControl?: boolean;
  /** Optional deep link to turn related modules on/off. */
  modulesHref?: string;
};

export const MODULE_SETUP_SCOPES: Record<string, ModuleSetupScope> = {
  quotation: {
    id: "quotation",
    title: "Quotation setup",
    blurb: "Decide whether quotations are required before orders, and whether a file must be attached.",
    policyKeys: ["sales_require_quotation", "quotation_require_attachment"],
    modulesHref: "/app/user-management/tenant-modules",
  },
  sales_order: {
    id: "sales_order",
    title: "Sales order setup",
    blurb: "Control order → deliver → invoice rules for this workspace.",
    policyKeys: [
      "sales_require_quotation",
      "sales_require_so",
      "sales_require_reservation",
      "sales_require_delivery_receipt",
      "legacy_combined_so_release",
      "sales_require_so_approval",
      "sales_order_require_attachment",
    ],
    modulesHref: "/app/user-management/tenant-modules",
  },
  sales: {
    id: "sales",
    title: "Sales invoice setup",
    blurb: "Rules for billing customers and posting sales to accounting.",
    policyKeys: [
      "sales_require_so",
      "sales_require_delivery_receipt",
      "sales_enforce_credit_limit",
      "sales_require_attachment",
      "accounts_auto_post_sales",
    ],
    modulesHref: "/app/user-management/tenant-modules",
  },
  selling: {
    id: "selling",
    title: "Selling process setup",
    blurb: "Whole sell journey — quote, order, invoice. Turn steps on or off here.",
    policyKeys: [
      "sales_require_quotation",
      "sales_require_so",
      "sales_require_reservation",
      "sales_require_delivery_receipt",
      "sales_enforce_credit_limit",
      "sales_require_so_approval",
    ],
    modulesHref: "/app/user-management/tenant-modules",
  },
  purchase_request: {
    id: "purchase_request",
    title: "Purchase request setup",
    blurb: "Whether staff must raise a request (and get approval) before buying.",
    policyKeys: ["purchase_require_pr", "purchase_require_pr_approval"],
    modulesHref: "/app/user-management/tenant-modules",
  },
  purchase_order: {
    id: "purchase_order",
    title: "Purchase order & receiving setup",
    blurb: "Rules from request → PO → goods receipt.",
    policyKeys: [
      "purchase_require_pr",
      "purchase_require_pr_approval",
      "purchase_require_po_approval",
      "purchase_order_require_attachment",
      "purchase_require_gr_before_supplier_invoice",
    ],
    modulesHref: "/app/user-management/tenant-modules",
  },
  purchases: {
    id: "purchases",
    title: "Purchase invoice setup",
    blurb: "Supplier billing rules and goods receipt requirements.",
    policyKeys: [
      "purchase_require_gr_before_supplier_invoice",
      "supplier_invoice_require_attachment",
      "accounts_auto_post_purchase",
    ],
    modulesHref: "/app/user-management/tenant-modules",
  },
  buying: {
    id: "buying",
    title: "Buying process setup",
    blurb: "Whole buy journey — request, order, receive, invoice.",
    policyKeys: [
      "purchase_require_pr",
      "purchase_require_pr_approval",
      "purchase_require_po_approval",
      "purchase_require_gr_before_supplier_invoice",
    ],
    modulesHref: "/app/user-management/tenant-modules",
  },
  pos: {
    id: "pos",
    title: "POS setup",
    blurb: "Counter sales usually skip quotation and sales order. Keep these off unless you need a strict process.",
    policyKeys: ["sales_require_quotation", "sales_require_so", "sales_enforce_credit_limit"],
    modulesHref: "/app/user-management/tenant-modules",
  },
  finance: {
    id: "finance",
    title: "Accounting setup",
    blurb: "Auto-posting, journal approval, and budget control for this workspace.",
    policyKeys: [
      "accounts_auto_post_or",
      "accounts_auto_post_pv",
      "accounts_auto_post_sales",
      "accounts_auto_post_purchase",
      "finance_require_je_approval",
      "inventory_gl_hybrid_enabled",
    ],
    showBudgetControl: true,
    modulesHref: "/app/user-management/tenant-modules",
  },
};

/** Map pathname → setup scope id (first matching base). */
export function setupScopeFromPath(pathname: string): string | null {
  const pairs: [string, string][] = [
    ["/app/quotation/", "quotation"],
    ["/app/sales-order/", "sales_order"],
    ["/app/sales/", "sales"],
    ["/app/selling/", "selling"],
    ["/app/purchase-request/", "purchase_request"],
    ["/app/purchase-order/", "purchase_order"],
    ["/app/purchases/", "purchases"],
    ["/app/buying/", "buying"],
    ["/app/pos/", "pos"],
    ["/app/finance/", "finance"],
  ];
  for (const [prefix, id] of pairs) {
    if (pathname.startsWith(prefix) || pathname === prefix.slice(0, -1)) return id;
  }
  return null;
}

export function setupFeatureTab(moduleBase: string): {
  label: string;
  href: string;
  settingsHref: string;
  headerPriority: "primary";
} {
  const href = `${moduleBase.replace(/\/$/, "")}/setup`;
  return { label: "Setup", href, settingsHref: href, headerPriority: "primary" };
}
