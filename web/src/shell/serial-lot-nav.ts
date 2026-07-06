export type SerialLotNavLink = {
  label: string;
  href: string;
  settingsHref?: string;
  permissionCode?: string;
};

export const SERIAL_LOT_PREFIX = "/app/inventory/serial-lot";

export const serialLotNavLinks: SerialLotNavLink[] = [
  {
    label: "Trace",
    href: "/app/inventory/serial-lot/trace",
    permissionCode: "inventory.serial_trace",
  },
  {
    label: "Registry",
    href: "/app/inventory/serial-lot/registry",
    permissionCode: "inventory.serial_registry",
  },
  {
    label: "Lots",
    href: "/app/inventory/serial-lot/lots",
    permissionCode: "inventory.serial_registry",
  },
  {
    label: "Movements",
    href: "/app/inventory/serial-lot/movements",
    permissionCode: "inventory.serial_movements",
  },
  {
    label: "Settings",
    href: "/app/inventory/serial-lot/settings",
    permissionCode: "inventory.serial_settings",
  },
  {
    label: "Receive",
    href: "/app/inventory/serial-lot/receive",
    permissionCode: "inventory.serial_receive",
  },
  {
    label: "Bills of Material",
    href: "/app/inventory/serial-lot/manufacturing/boms",
    permissionCode: "manufacturing.boms",
  },
  {
    label: "Work Orders",
    href: "/app/inventory/serial-lot/manufacturing/work-orders",
    permissionCode: "manufacturing.work_orders",
  },
];

export function isSerialLotPath(pathname: string): boolean {
  return pathname.startsWith(SERIAL_LOT_PREFIX);
}

export function isSerialLotNavLinkActive(pathname: string, link: SerialLotNavLink): boolean {
  if (link.settingsHref && pathname === link.settingsHref) return true;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function serialLotHeaderTitle(pathname: string): string {
  const link = serialLotNavLinks.find((l) => isSerialLotNavLinkActive(pathname, l));
  if (!link) return "Serial & Lot";
  if (link.settingsHref && pathname === link.settingsHref) return `${link.label} settings`;
  return link.label;
}
