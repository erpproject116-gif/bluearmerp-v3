export type WmsNavLink = {
  label: string;
  href: string;
  permissionCode?: string;
};

export const WMS_PREFIX = "/app/inventory/wms";

export const wmsNavLinks: WmsNavLink[] = [
  {
    label: "Scheduled Receipts",
    href: "/app/inventory/wms/scheduled-receipts",
    permissionCode: "wms.read",
  },
];

export function isWmsPath(pathname: string): boolean {
  return pathname.startsWith(WMS_PREFIX);
}

export function isWmsNavLinkActive(pathname: string, link: WmsNavLink): boolean {
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function wmsHeaderTitle(pathname: string): string {
  const link = wmsNavLinks.find((l) => isWmsNavLinkActive(pathname, l));
  return link?.label ?? "WMS";
}
