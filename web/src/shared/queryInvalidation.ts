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
    "commission-rules",
    "commission-accruals",
    "commission-accounting",
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
    "auth-branches",
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
    "inv-units",
    "inv-units-all",
    "inv-unit-conversions",
    "repair-orders",
  ],
  finance: [
    "supplier-invoices",
    "payment-vouchers",
    "official-receipts",
    "finance-workspace",
    "finance-bank-recon-statements",
    "finance-bank-recon-unmatched",
    "finance-bank-accounts-options",
    "finance-contracts",
    "finance-contract-milestones",
    "finance-notes",
    "finance-checks",
    "finance-fiscal-years",
    "finance-fiscal-periods",
    "finance-fiscal-settings",
    "finance-accounts",
    "finance-accounts-parent-options",
    "finance-account-defaults",
    "finance-accounts-picker",
    "journal-entries",
    "landed-costs",
    "withholding-codes",
    "supplier-payment-status",
    "ap-by-vendor",
    "budget-vs-actual",
  ],
  quotation: ["quotations", "quotation-status-report", "quotation-tax-types"],
  pos: ["pos-current-session", "pos-catalog-items", "pos-catalog-categories", "pos-settings"],
  dashboard: [
    "dashboard-summary",
    "dashboard-sales-trend",
    "dashboard-inventory-trend",
    "dashboard-red-flags",
    "dashboard-top-customers",
    "dashboard-top-vendors",
    "dashboard-top-items",
    "reconciliation-summary",
  ],
  shipping: ["shipping-orders", "shipping-rules", "delivery-trips"],
  quality: ["qc-requests", "capa-records", "qms-ncrs"],
  manufacturing: ["mfg-boms", "mfg-work-orders"],
  hr: [
    "hr-employees",
    "hr-pay-periods",
    "hr-payslips",
    "hr-review-cycles",
    "hr-reviews",
    "hr-leave",
    "hr-attendance",
  ],
  platform: ["onboarding", "setup-readiness"],
  crm: [
    "crm-warranty",
    "crm-task-summaries",
    "crm-sales-team",
    "crm-notifications",
    "crm-dashboard",
    "crm-leads-dashboard",
    "crm-follow-up-tasks",
    "crm-leads",
    "crm-clients-health",
    "crm-client-health",
  ],
  operations: [
    "operations-workspaces",
    "operations-columns",
    "operations-work-items",
    "operations-automation",
    "operations-dashboards",
    "operations-widget-data",
    "operations-tasks-summary",
    "operations-industry-packs",
  ],
  sop: ["sop-documents", "sop-document", "sop-dashboard"],
  okr: ["okr-objectives", "okr-key-results", "okr-dashboard"],
  booking: ["bookings", "booking-calendar"],
  support: ["support-tickets"],
  selling: ["selling-workspace"],
  wms: ["wms-scheduled-receipts"],
  fixedAssets: ["fixed-assets", "fixed-asset-depreciation"],
  jobCosting: ["job-cost-projects", "job-cost-timesheets"],
  bi: ["bi-saved-views"],
  companyBudget: ["company-budget"],
};

type MutationRule = {
  test: (path: string, method: string) => boolean;
  domains: string[];
};

/** Invalidate only the primary list/workspace domain per API area (no cross-module fan-out). */
const MUTATION_RULES: MutationRule[] = [
  { test: (p) => p.startsWith("/api/v1/sales"), domains: ["sales", "dashboard"] },
  { test: (p) => p.startsWith("/api/v1/sales-order"), domains: ["salesOrder", "dashboard"] },
  { test: (p) => p.startsWith("/api/v1/purchase-request"), domains: ["purchaseRequest"] },
  { test: (p) => p.startsWith("/api/v1/purchase-order"), domains: ["purchaseOrder", "goodsReceipt"] },
  { test: (p) => p.startsWith("/api/v1/goods-receipt"), domains: ["goodsReceipt", "purchaseOrder", "inventory"] },
  { test: (p) => p.startsWith("/api/v1/finance"), domains: ["finance", "dashboard"] },
  { test: (p) => p.startsWith("/api/v1/inventory"), domains: ["inventory", "dashboard"] },
  { test: (p) => p.startsWith("/api/v1/quotation"), domains: ["quotation"] },
  { test: (p) => p.startsWith("/api/v1/pos"), domains: ["pos", "sales", "inventory"] },
  { test: (p) => p.startsWith("/api/v1/shipping"), domains: ["shipping", "salesOrder"] },
  { test: (p) => p.startsWith("/api/v1/quality"), domains: ["quality"] },
  { test: (p) => p.startsWith("/api/v1/manufacturing"), domains: ["manufacturing", "inventory"] },
  { test: (p) => p.startsWith("/api/v1/crm"), domains: ["crm"] },
  { test: (p) => p.startsWith("/api/v1/operations"), domains: ["operations"] },
  { test: (p) => p.startsWith("/api/v1/sop"), domains: ["sop"] },
  { test: (p) => p.startsWith("/api/v1/okr"), domains: ["okr"] },
  { test: (p) => p.startsWith("/api/v1/hr"), domains: ["hr"] },
  { test: (p) => p.startsWith("/api/v1/platform/onboarding"), domains: ["platform"] },
  { test: (p) => p.startsWith("/api/v1/platform/setup"), domains: ["platform"] },
  { test: (p) => p.startsWith("/api/v1/booking"), domains: ["booking"] },
  { test: (p) => p.startsWith("/api/v1/support"), domains: ["support"] },
  { test: (p) => p.startsWith("/api/v1/selling"), domains: ["selling", "sales"] },
  { test: (p) => p.startsWith("/api/v1/wms"), domains: ["wms", "inventory"] },
  { test: (p) => p.startsWith("/api/v1/fixed-assets"), domains: ["fixedAssets", "finance"] },
  { test: (p) => p.startsWith("/api/v1/job-costing"), domains: ["jobCosting"] },
  { test: (p) => p.startsWith("/api/v1/bi"), domains: ["bi"] },
  { test: (p) => p.startsWith("/api/v1/company-budget"), domains: ["companyBudget", "finance"] },
  { test: (p) => p.startsWith("/api/v1/delivery-receipt"), domains: ["salesOrder"] },
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
        p.startsWith("/api/v1/quotation") ||
        p.startsWith("/api/v1/manufacturing")),
    domains: ["dashboard"],
  },
  {
    test: (p, m) =>
      m === "PATCH" &&
      (/\/progress-status$/.test(p) || /\/confirm$/.test(p) || /\/approve$/.test(p) || /\/reject$/.test(p) || /\/complete$/.test(p)),
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
  "/send-report-email",
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
  if (path.includes("/usage/")) return true;
  if (path.includes("/attachments")) return true;
  if (path.startsWith("/api/v1/settings/")) return true;
  if (path.startsWith("/api/v1/form-field-settings")) return true;
  if (path.startsWith("/api/v1/column-label-settings")) return true;
  if (path.startsWith("/api/v1/comms/send-report-email")) return true;
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
  if (prefix.startsWith("finance-") && head.startsWith("finance-")) return true;
  if (prefix.startsWith("hr-") && head.startsWith("hr-")) return true;
  if (prefix.startsWith("inv-") && head.startsWith("inv-")) return true;
  if (prefix.startsWith("mfg-") && head.startsWith("mfg-")) return true;
  if (prefix.startsWith("crm-") && head.startsWith("crm-")) return true;
  if (prefix.startsWith("operations-") && head.startsWith("operations-")) return true;
  if (prefix.startsWith("commission-") && head.startsWith("commission-")) return true;
  return false;
}

function predicateForPrefixes(prefixes: Iterable<string>) {
  const set = new Set(prefixes);
  return (q: { queryKey: unknown }) => {
    for (const prefix of set) {
      if (matchesPrefix(q.queryKey, prefix)) return true;
    }
    return false;
  };
}

export function invalidateQueryPrefixes(client: QueryClient, prefixes: Iterable<string>) {
  const predicate = predicateForPrefixes(prefixes);
  void client.invalidateQueries({ predicate });
}

/**
 * Invalidate and refetch active queries so lists update without a hard refresh.
 * `refetchType: "active"` already refetches every mounted query that matches, so
 * a follow-up refetchQueries would only fire the same requests a second time.
 */
export async function refetchQueryPrefixes(client: QueryClient, prefixes: Iterable<string>): Promise<void> {
  const predicate = predicateForPrefixes(prefixes);
  await client.invalidateQueries({ predicate, refetchType: "active" });
}

export async function invalidateAfterMutation(path: string, method?: string): Promise<void> {
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

  await refetchQueryPrefixes(queryClient, collectKeys([...domains]));
}

/** Manually refresh related lists after a modal save (optional extra keys). */
export function invalidateDomains(...domains: (keyof typeof DOMAIN_KEYS)[]) {
  void refetchQueryPrefixes(queryClient, collectKeys(domains));
}

export { DOMAIN_KEYS };
