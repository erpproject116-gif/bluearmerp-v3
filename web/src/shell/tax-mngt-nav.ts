export type TaxMngtNavLink = {
  label: string;
  href: string;
  settingsHref?: string;
};

export const TAX_MNGT_PREFIX = "/app/quotation/tax-mngt";

export const taxMngtNavLinks: TaxMngtNavLink[] = [
  {
    label: "Tax Types",
    href: "/app/quotation/tax-mngt/tax-types",
    settingsHref: "/app/quotation/tax-mngt/tax-types/settings",
  },
  {
    label: "Currencies",
    href: "/app/quotation/tax-mngt/currencies",
    settingsHref: "/app/quotation/tax-mngt/currencies/settings",
  },
];

export function isTaxMngtPath(pathname: string): boolean {
  return pathname.startsWith(TAX_MNGT_PREFIX);
}

export function isTaxMngtNavLinkActive(pathname: string, link: TaxMngtNavLink): boolean {
  if (link.settingsHref && pathname === link.settingsHref) return true;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function taxMngtHeaderTitle(pathname: string): string {
  const link = taxMngtNavLinks.find((l) => isTaxMngtNavLinkActive(pathname, l));
  if (!link) return "Tax Management";
  if (link.settingsHref && pathname === link.settingsHref) return `${link.label} settings`;
  return link.label;
}
