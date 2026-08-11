export type AcctNavLink = {
  label: string;
  href: string;
  permissionCode?: string;
  /** Header tab tier — primary stays visible; overflow goes under More. */
  headerPriority?: "primary" | "overflow";
};

export const ACCT_II_PREFIX = "/app/finance/acct-ii";

/** Report paths linked from Acct II More menu (keep Acct II header when opened). */
const ACCT_II_REPORT_PATHS = [
  "/app/finance/reports/customer-vendor-book-ar",
  "/app/finance/reports/customer-vendor-book-ap",
  "/app/finance/reports/customer-vendor-book-ii-ar",
  "/app/finance/reports/customer-vendor-book-ii-ap",
  "/app/finance/reports/ar-aging-details",
  "/app/finance/reports/ap-aging-details",
] as const;

/** BluearmERP Acct. II — receivable/payable depth, checks, budget, withholding, import cost, contracts, notes */
export const acctIINavLinks: AcctNavLink[] = [
  { label: "New Receivable Payment", href: "/app/finance/receivables", permissionCode: "finance.official_receipts_new", headerPriority: "primary" },
  { label: "New Payable Payment", href: "/app/finance/payables", permissionCode: "finance.payment_vouchers_new", headerPriority: "primary" },
  { label: "Receivables", href: "/app/finance/collections", permissionCode: "finance.reports_ar_by_customer", headerPriority: "overflow" },
  { label: "Payables", href: "/app/finance/disbursements", permissionCode: "finance.reports_ap_by_vendor", headerPriority: "overflow" },
  { label: "Check Register", href: "/app/finance/acct-ii/checks", permissionCode: "finance.check_read", headerPriority: "overflow" },
  { label: "Withholding Tax", href: "/app/finance/acct-ii/withholding-codes", permissionCode: "finance.withholding_read", headerPriority: "overflow" },
  { label: "BIR Statutory", href: "/app/finance/statutory", permissionCode: "finance.statutory_read", headerPriority: "overflow" },
  { label: "BIR Taxpayer", href: "/app/finance/statutory/taxpayer-profile", permissionCode: "finance.statutory_read", headerPriority: "overflow" },
  { label: "Document Series", href: "/app/finance/statutory/document-series", permissionCode: "finance.statutory_read", headerPriority: "overflow" },
  { label: "Notes", href: "/app/finance/acct-ii/notes", permissionCode: "finance.note_read", headerPriority: "overflow" },
  { label: "Landed Cost", href: "/app/finance/acct-ii/landed-costs", permissionCode: "finance.landed_cost_read", headerPriority: "overflow" },
  { label: "Contracts", href: "/app/finance/acct-ii/contracts", permissionCode: "finance.contract_read", headerPriority: "overflow" },
  { label: "Setup", href: "/app/finance/acct-ii/setup", permissionCode: "settings.process_policies", headerPriority: "overflow" },
  { label: "Customer/Vendor Book I (AR)", href: "/app/finance/reports/customer-vendor-book-ar", permissionCode: "finance.reports_ar_by_customer", headerPriority: "overflow" },
  { label: "Customer/Vendor Book I (AP)", href: "/app/finance/reports/customer-vendor-book-ap", permissionCode: "finance.reports_ap_by_vendor", headerPriority: "overflow" },
  { label: "Customer/Vendor Book II (AR)", href: "/app/finance/reports/customer-vendor-book-ii-ar", permissionCode: "finance.reports_ar_by_customer", headerPriority: "overflow" },
  { label: "Customer/Vendor Book II (AP)", href: "/app/finance/reports/customer-vendor-book-ii-ap", permissionCode: "finance.reports_ap_by_vendor", headerPriority: "overflow" },
  { label: "A/R Aging Details", href: "/app/finance/reports/ar-aging-details", permissionCode: "finance.reports_ar_by_customer", headerPriority: "overflow" },
  { label: "A/P Aging Details", href: "/app/finance/reports/ap-aging-details", permissionCode: "finance.reports_ap_by_vendor", headerPriority: "overflow" },
];

export function isAcctIIPath(pathname: string): boolean {
  if (pathname.startsWith(ACCT_II_PREFIX)) return true;
  if (pathname.startsWith("/app/finance/statutory")) return true;
  if (pathname.startsWith("/app/finance/budgets")) return true;
  if (pathname.startsWith("/app/finance/receivables")) return true;
  if (pathname.startsWith("/app/finance/payables")) return true;
  if (pathname.startsWith("/app/finance/collections")) return true;
  if (pathname.startsWith("/app/finance/disbursements")) return true;
  for (const report of ACCT_II_REPORT_PATHS) {
    if (pathname === report || pathname.startsWith(`${report}/`)) return true;
  }
  return false;
}

export function isAcctIINavLinkActive(pathname: string, link: AcctNavLink): boolean {
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function acctIIHeaderTitle(pathname: string): string {
  const link = acctIINavLinks.find((l) => isAcctIINavLinkActive(pathname, l));
  return link?.label ?? "Receivables & payables";
}
