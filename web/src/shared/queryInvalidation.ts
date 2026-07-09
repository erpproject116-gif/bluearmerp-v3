import type { QueryClient } from "@tanstack/solid-query";
import { queryClient } from "./queryClient";

/** Query key prefixes grouped by business domain for cascade invalidation. */
const DOMAIN_KEYS: Record<string, readonly string[]> = {
  sales: [
    "sales",
    "sales-returns",
    "sales-status-report",
    "sales-pre-invoicing-report",
    "sales-discount-status",
    "collective-invoices",
    "sales-price-batch",
    "selling-workspace",
  ],
  salesOrder: [
    "sales-orders",
    "sales-order-release-queue",
    "sales-order-outstanding-report",
    "sales-order-status-report",
    "delivery-receipts",
  ],
  purchaseRequest: ["purchase-requests", "purchase-request-status-report", "purchase-status-report"],
  purchaseOrder: ["purchase-orders", "purchase-returns", "report-po-analysis", "buying-workspace"],
  goodsReceipt: ["goods-receipts", "report-items-to-receive"],
  inventory: [
    "inventory",
    "serial-units",
    "serial-events",
    "lot-batches",
    "serial-report",
    "serial-adjustment",
    "inventory-workspace",
    "stock-movements",
    "report-stock-balance",
    "report-stock-ledger",
    "report-stock-ageing",
    "report-on-hand",
    "report-inv-book",
  ],
  finance: [
    "supplier-invoices",
    "payment-vouchers",
    "official-receipts",
    "finance-workspace",
    "finance-bank-recon-statements",
    "finance-bank-recon-unmatched",
    "finance-contracts",
    "finance-notes",
    "finance-checks",
    "landed-costs",
    "withholding-codes",
    "supplier-payment-status",
    "ap-by-vendor",
    "budget-vs-actual",
  ],
  quotation: ["quotations", "quotation-status-report"],
  pos: ["pos-current-session", "pos-catalog-items", "pos-catalog-categories"],
  dashboard: ["dashboard-summary", "dashboard-sales-trend", "dashboard-inventory-trend", "dashboard-red-flags", "dashboard-top-customers", "dashboard-top-vendors", "dashboard-top-items", "reconciliation-summary"],
  shipping: ["shipping-orders", "shipping-rules", "delivery-trips"],
  quality: ["qc-requests", "capa-records", "qms-ncrs"],
  manufacturing: ["mfg-boms", "mfg-work-orders"],
  hr: ["hr-employees", "hr-pay-periods", "hr-payslips"],
  platform: ["onboarding", "setup-readiness"],
  crm: ["crm-warranty", "crm-task-summaries", "crm-sales-team", "crm-notifications", "crm-dashboard", "crm-follow-up-tasks"],
  operations: [
    "operations-workspaces",
    "operations-columns",
    "operations-work-items",
    "operations-automation",
    "operations-dashboards",
    "operations-widget-data",
    "operations-industry-packs",
  ],
};

type MutationRule = {
  test: (path: string, method: string) => boolean;
  domains: string[];
};

/** Invalidate only the primary list/workspace domain per API area (no cross-module fan-out). */
const MUTATION_RULES: MutationRule[] = [
  { test: (p) => p.startsWith("/api/v1/sales"), domains: ["sales"] },
  { test: (p) => p.startsWith("/api/v1/sales-order"), domains: ["salesOrder"] },
  { test: (p) => p.startsWith("/api/v1/purchase-request"), domains: ["purchaseRequest"] },
  { test: (p) => p.startsWith("/api/v1/purchase-order"), domains: ["purchaseOrder", "goodsReceipt"] },
  { test: (p) => p.startsWith("/api/v1/goods-receipt"), domains: ["goodsReceipt", "purchaseOrder"] },
  { test: (p) => p.startsWith("/api/v1/finance"), domains: ["finance"] },
  { test: (p) => p.startsWith("/api/v1/inventory"), domains: ["inventory"] },
  { test: (p) => p.startsWith("/api/v1/quotation"), domains: ["quotation"] },
  { test: (p) => p.startsWith("/api/v1/pos"), domains: ["pos", "sales", "inventory"] },
  { test: (p) => p.startsWith("/api/v1/shipping"), domains: ["shipping", "salesOrder"] },
  { test: (p) => p.startsWith("/api/v1/quality"), domains: ["quality"] },
  { test: (p) => p.startsWith("/api/v1/manufacturing"), domains: ["manufacturing"] },
  { test: (p) => p.startsWith("/api/v1/crm"), domains: ["crm"] },
  { test: (p) => p.startsWith("/api/v1/operations"), domains: ["operations"] },
  { test: (p) => p.startsWith("/api/v1/hr"), domains: ["hr"] },
  { test: (p) => p.startsWith("/api/v1/platform/onboarding"), domains: ["platform"] },
  { test: (p) => p.startsWith("/api/v1/platform/setup"), domains: ["platform"] },
];

/** Stock-moving or approval flows that should refresh dashboard KPIs. */
const DASHBOARD_MUTATION_RULES: MutationRule[] = [
  {
    test: (p, m) =>
      m === "POST" &&
      (p.startsWith("/api/v1/sales") ||
        p.startsWith("/api/v1/sales-order") ||
        p.startsWith("/api/v1/purchase-order") ||
        p.startsWith("/api/v1/goods-receipt") ||
        p.startsWith("/api/v1/finance/supplier-invoices") ||
        p.startsWith("/api/v1/quotation")),
    domains: ["dashboard"],
  },
  {
    test: (p, m) =>
      m === "PATCH" &&
      (/\/progress-status$/.test(p) || /\/confirm$/.test(p) || /\/approve$/.test(p) || /\/reject$/.test(p)),
    domains: ["dashboard"],
  },
];

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * POST endpoints that only read/query data must not trigger mutation cache invalidation,
 * or TanStack Query can refetch in a loop (see crm/follow-up-tasks/summaries).
 */
const READ_ONLY_POST_PATH_MARKERS = [
  "/follow-up-tasks/summaries",
  "/resolve-scan",
  "/items/search",
] as const;

/** True when a mutating request should not fan out cache invalidation. */
export function shouldSkipMutationInvalidation(path: string, method: string): boolean {
  const m = method.toUpperCase();
  if (!MUTATING.has(m)) return true;
  if (/\/search(\?|$)/.test(path)) return true;
  if (path.includes("/import-template")) return true;
  if (path.includes("/preview")) return true;
  if (path.includes("/preview-sequences")) return true;
  if (path.includes("/drafts")) return true;
  if (/\/export(\?|$)/.test(path)) return true;
  if (/\/print(\?|$)/.test(path)) return true;
  if (path.includes("/auth/")) return true;
  if (path.includes("/presence/")) return true;
  if (path.includes("/attachments")) return true;
  if (path.startsWith("/api/v1/settings/")) return true;
  if (path.startsWith("/api/v1/form-field-settings")) return true;
  if (path.startsWith("/api/v1/column-label-settings")) return true;
  if (m === "POST") {
    for (const marker of READ_ONLY_POST_PATH_MARKERS) {
      if (path.includes(marker)) return true;
    }
  }
  return false;
}

/** Paths that mutate data but should not trigger broad cache invalidation. */
function skipInvalidation(path: string, method: string): boolean {
  return shouldSkipMutationInvalidation(path, method);
}

function collectKeys(domains: string[]): Set<string> {
  const keys = new Set<string>();
  for (const d of domains) {
    const list = DOMAIN_KEYS[d];
    if (list) for (const k of list) keys.add(k);
  }
  return keys;
}

function matchesPrefix(queryKey: unknown, prefix: string): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const head = String(queryKey[0]);
  if (head === prefix) return true;
  if (prefix.endsWith("-")) return head.startsWith(prefix);
  if (head.startsWith(`${prefix}-`)) return true;
  if (prefix.startsWith("serial-report") && head.startsWith("serial-report")) return true;
  if (prefix.startsWith("report-") && head.startsWith("report-")) return true;
  if (prefix.startsWith("dashboard") && head.startsWith("dashboard")) return true;
  return false;
}

export function invalidateQueryPrefixes(client: QueryClient, prefixes: Iterable<string>) {
  const set = new Set(prefixes);
  void client.invalidateQueries({
    predicate: (q) => {
      for (const prefix of set) {
        if (matchesPrefix(q.queryKey, prefix)) return true;
      }
      return false;
    },
  });
}

export function invalidateAfterMutation(path: string, method?: string) {
  const m = (method ?? "GET").toUpperCase();
  if (skipInvalidation(path, m)) return;

  const domains = new Set<string>();
  for (const rule of MUTATION_RULES) {
    if (rule.test(path, m)) for (const d of rule.domains) domains.add(d);
  }
  for (const rule of DASHBOARD_MUTATION_RULES) {
    if (rule.test(path, m)) for (const d of rule.domains) domains.add(d);
  }
  if (domains.size === 0) return;

  invalidateQueryPrefixes(queryClient, collectKeys([...domains]));
}

/** Manually refresh related lists after a modal save (optional extra keys). */
export function invalidateDomains(...domains: (keyof typeof DOMAIN_KEYS)[]) {
  invalidateQueryPrefixes(queryClient, collectKeys(domains));
}

export { DOMAIN_KEYS };
