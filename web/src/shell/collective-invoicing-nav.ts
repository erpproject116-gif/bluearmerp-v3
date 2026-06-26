export type CollectiveInvoicingNavLink = {
  label: string;
  href: string;
  permissionCode?: string;
};

export const COLLECTIVE_INVOICING_PREFIX = "/app/sales/collective-invoicing";

export const collectiveInvoicingNavLinks: CollectiveInvoicingNavLink[] = [
  {
    label: "Sales Invoice List (Inv.)",
    href: "/app/sales/collective-invoicing/list",
    permissionCode: "sales.collective_invoice_list",
  },
  {
    label: "Sales Invoice Status (Inv.)",
    href: "/app/sales/collective-invoicing/status",
    permissionCode: "sales.collective_invoice_status",
  },
];

export function isCollectiveInvoicingPath(pathname: string): boolean {
  return pathname.startsWith(COLLECTIVE_INVOICING_PREFIX);
}

export function isCollectiveInvoicingNavLinkActive(pathname: string, link: CollectiveInvoicingNavLink): boolean {
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function collectiveInvoicingHeaderTitle(pathname: string): string {
  const link = collectiveInvoicingNavLinks.find((l) => isCollectiveInvoicingNavLinkActive(pathname, l));
  if (link) return link.label;
  if (pathname.includes("/slip/print")) return "Sales Slip";
  if (pathname.includes("/invoice/print")) return "Sales Invoice";
  if (pathname.includes("/status/print")) return "Sales Invoice Status";
  return "Collective Invoicing (Sales)";
}
