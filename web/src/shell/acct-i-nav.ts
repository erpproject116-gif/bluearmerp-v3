export type AcctNavLink = {
  label: string;
  href: string;
  permissionCode?: string;
};

export const ACCT_I_PREFIX = "/app/finance/acct-i";

export const acctINavLinks: AcctNavLink[] = [
  { label: "Journal Entries", href: "/app/finance/acct-i/journal-entries", permissionCode: "finance.journal_entries" },
  { label: "Chart of Accounts", href: "/app/finance/acct-i/chart-of-accounts", permissionCode: "finance.journal_entries" },
  { label: "Fiscal Years", href: "/app/finance/acct-i/fiscal-years", permissionCode: "finance.journal_entries" },
  { label: "Bank Reconciliation", href: "/app/finance/acct-i/bank-reconciliation", permissionCode: "finance.journal_entries" },
  { label: "Payment Entries", href: "/app/finance/acct-i/payment-entries", permissionCode: "finance.official_receipts" },
  { label: "Trial Balance", href: "/app/finance/acct-i/reports/trial-balance", permissionCode: "finance.journal_entries" },
  { label: "General Ledger", href: "/app/finance/acct-i/reports/general-ledger", permissionCode: "finance.journal_entries" },
  { label: "Profit & Loss", href: "/app/finance/acct-i/reports/profit-and-loss", permissionCode: "finance.journal_entries" },
  { label: "Balance Sheet", href: "/app/finance/acct-i/reports/balance-sheet", permissionCode: "finance.journal_entries" },
];

export function isAcctIPath(pathname: string): boolean {
  return pathname === ACCT_I_PREFIX || pathname.startsWith(`${ACCT_I_PREFIX}/`);
}

export function isAcctINavLinkActive(pathname: string, link: AcctNavLink): boolean {
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function acctIHeaderTitle(pathname: string): string {
  const link = acctINavLinks.find((l) => isAcctINavLinkActive(pathname, l));
  return link?.label ?? "Acct. I";
}
