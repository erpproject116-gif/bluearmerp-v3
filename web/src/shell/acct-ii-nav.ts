export type AcctNavLink = {
  label: string;
  href: string;
  permissionCode?: string;
};

export const ACCT_II_PREFIX = "/app/finance/acct-ii";

/** BluearmERP Acct. II — receivable/payable depth, checks, budget, withholding, import cost, contracts, notes */
export const acctIINavLinks: AcctNavLink[] = [
  { label: "Check Register", href: "/app/finance/acct-ii/checks", permissionCode: "finance.check_read" },
  { label: "Withholding Tax", href: "/app/finance/acct-ii/withholding-codes", permissionCode: "finance.withholding_read" },
  { label: "Notes", href: "/app/finance/acct-ii/notes", permissionCode: "finance.note_read" },
  { label: "Landed Cost", href: "/app/finance/acct-ii/landed-costs", permissionCode: "finance.landed_cost_read" },
  { label: "Contracts", href: "/app/finance/acct-ii/contracts", permissionCode: "finance.contract_read" },
  { label: "Customer/Vendor Book I (AR)", href: "/app/finance/reports/customer-vendor-book-ar", permissionCode: "finance.reports_ar_by_customer" },
  { label: "Customer/Vendor Book I (AP)", href: "/app/finance/reports/customer-vendor-book-ap", permissionCode: "finance.reports_ap_by_vendor" },
  { label: "Customer/Vendor Book II (AR)", href: "/app/finance/reports/customer-vendor-book-ii-ar", permissionCode: "finance.reports_ar_by_customer" },
  { label: "Customer/Vendor Book II (AP)", href: "/app/finance/reports/customer-vendor-book-ii-ap", permissionCode: "finance.reports_ap_by_vendor" },
  { label: "A/R Aging Details", href: "/app/finance/reports/ar-aging-details", permissionCode: "finance.reports_ar_by_customer" },
  { label: "A/P Aging Details", href: "/app/finance/reports/ap-aging-details", permissionCode: "finance.reports_ap_by_vendor" },
];

export function isAcctIIPath(pathname: string): boolean {
  if (pathname.startsWith(ACCT_II_PREFIX)) return true;
  if (pathname.startsWith("/app/finance/budgets")) return true;
  return false;
}

export function isAcctIINavLinkActive(pathname: string, link: AcctNavLink): boolean {
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function acctIIHeaderTitle(pathname: string): string {
  const link = acctIINavLinks.find((l) => isAcctIINavLinkActive(pathname, l));
  return link?.label ?? "Acct. II";
}
