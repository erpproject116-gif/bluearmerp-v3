export type AfterSalesNavLink = {
  label: string;
  href: string;
  settingsHref?: string;
};

export type AfterSalesNavGroup = {
  label: string;
  links: AfterSalesNavLink[];
};

export const AFTER_SALES_PREFIX = "/app/inventory/after-sales";

export const afterSalesNavGroups: AfterSalesNavGroup[] = [
  {
    label: "Repair Order",
    links: [
      {
        label: "Repair Order List",
        href: "/app/inventory/after-sales/repair-orders",
        settingsHref: "/app/inventory/after-sales/repair-orders/settings",
      },
      { label: "New Repair Order", href: "/app/inventory/after-sales/repair-orders/new" },
      { label: "Repair Order Status", href: "/app/inventory/after-sales/repair-orders/status" },
    ],
  },
  {
    label: "Register Repair",
    links: [
      { label: "New Repair", href: "/app/inventory/after-sales/register-repair/new" },
      { label: "Repair List", href: "/app/inventory/after-sales/register-repair" },
      { label: "Repair Status", href: "/app/inventory/after-sales/register-repair/status" },
      { label: "A/S Consumption Status", href: "/app/inventory/after-sales/register-repair/consumption" },
    ],
  },
];

export const afterSalesNavLinks: AfterSalesNavLink[] = afterSalesNavGroups.flatMap((g) => g.links);

export function isAfterSalesPath(pathname: string): boolean {
  return pathname.startsWith(AFTER_SALES_PREFIX);
}

export function isAfterSalesNavLinkActive(pathname: string, link: AfterSalesNavLink): boolean {
  if (link.settingsHref && pathname === link.settingsHref) return true;

  const href = link.href;
  if (href === "/app/inventory/after-sales/repair-orders") {
    return (
      pathname === href ||
      (pathname.startsWith(`${href}/`) &&
        !pathname.includes("/new") &&
        !pathname.includes("/status") &&
        !pathname.includes("/settings"))
    );
  }
  if (href === "/app/inventory/after-sales/register-repair") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveAfterSalesNavLink(pathname: string): AfterSalesNavLink | undefined {
  if (!isAfterSalesPath(pathname)) return undefined;
  return afterSalesNavLinks.find((link) => isAfterSalesNavLinkActive(pathname, link));
}

export function afterSalesHeaderTitle(pathname: string): string {
  const link = resolveAfterSalesNavLink(pathname);
  if (!link) return "After-Sales";
  if (link.settingsHref && pathname === link.settingsHref) return `${link.label} settings`;
  return link.label;
}
