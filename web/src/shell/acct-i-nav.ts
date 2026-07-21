export type AcctNavLink = {
  label: string;
  href: string;
  permissionCode?: string;
  /** Header tab tier — primary stays visible; overflow goes under More. */
  headerPriority?: "primary" | "overflow";
};

export const ACCT_I_PREFIX = "/app/finance/acct-i";

export const acctINavLinks: AcctNavLink[] = [
  { label: "Journal entries", href: "/app/finance/acct-i/journal-entries", permissionCode: "finance.journal_entries", headerPriority: "primary" },
  { label: "Chart of accounts", href: "/app/finance/acct-i/chart-of-accounts", permissionCode: "finance.journal_entries", headerPriority: "primary" },
  { label: "Reports", href: "/app/finance/reports", permissionCode: "finance.journal_entries", headerPriority: "primary" },
  { label: "Fiscal years", href: "/app/finance/acct-i/fiscal-years", permissionCode: "finance.journal_entries" },
  { label: "Bank reconciliation", href: "/app/finance/acct-i/bank-reconciliation", permissionCode: "finance.journal_entries" },
  { label: "Payment entries", href: "/app/finance/acct-i/payment-entries", permissionCode: "finance.official_receipts" },
  { label: "Trial balance", href: "/app/finance/acct-i/reports/trial-balance", permissionCode: "finance.journal_entries" },
  { label: "General ledger", href: "/app/finance/acct-i/reports/general-ledger", permissionCode: "finance.journal_entries" },
  { label: "Profit & loss", href: "/app/finance/acct-i/reports/profit-and-loss", permissionCode: "finance.journal_entries" },
  { label: "Balance sheet", href: "/app/finance/acct-i/reports/balance-sheet", permissionCode: "finance.journal_entries" },
  { label: "Cash flow statement", href: "/app/finance/acct-i/reports/cash-flow-statement", permissionCode: "finance.journal_entries" },
  { label: "Cash book", href: "/app/finance/acct-i/reports/cash-book", permissionCode: "finance.journal_entries" },
  { label: "Fund statement", href: "/app/finance/acct-i/reports/fund-statement", permissionCode: "finance.journal_entries" },
];

export function isAcctIPath(pathname: string): boolean {
  return pathname === ACCT_I_PREFIX || pathname.startsWith(`${ACCT_I_PREFIX}/`);
}

export function isAcctINavLinkActive(pathname: string, link: AcctNavLink): boolean {
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function acctIHeaderTitle(pathname: string): string {
  const link = acctINavLinks.find((l) => isAcctINavLinkActive(pathname, l));
  return link?.label ?? "General ledger";
}
