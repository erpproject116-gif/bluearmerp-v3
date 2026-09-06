export type SerialLotNavLink = {
  label: string;
  href: string;
  settingsHref?: string;
  permissionCode?: string;
  /** Header tab tier — primary stays visible; overflow goes under More. */
  headerPriority?: "primary" | "overflow";
};

export const SERIAL_LOT_PREFIX = "/app/inventory/serial-lot";

export const serialLotNavLinks: SerialLotNavLink[] = [
  {
    label: "Serials",
    href: "/app/inventory/serial-lot/registry",
    permissionCode: "inventory.serial_registry",
    headerPriority: "primary",
  },
  {
    label: "Receive Station",
    href: "/app/inventory/serial-lot/receive-station",
    permissionCode: "inventory.serial_receive",
    headerPriority: "primary",
  },
  {
    label: "Lots",
    href: "/app/inventory/serial-lot/lots",
    permissionCode: "inventory.serial_registry",
    headerPriority: "primary",
  },
  {
    label: "Serial Inv. Book",
    href: "/app/inventory/serial-lot/reports/book",
    permissionCode: "inventory.serial_movements",
    headerPriority: "primary",
  },
  {
    label: "Lot Inv. Book",
    href: "/app/inventory/serial-lot/reports/lot-book",
    permissionCode: "inventory.serial_movements",
    headerPriority: "primary",
  },
  {
    label: "Settings",
    href: "/app/inventory/serial-lot/settings",
    permissionCode: "inventory.serial_settings",
    headerPriority: "overflow",
  },
  {
    label: "Receive station",
    href: "/app/inventory/serial-lot/receive-station",
    permissionCode: "inventory.receive_station",
    headerPriority: "overflow",
  },
  {
    /** Deep-link / typed lookup; open a row from Serials for day-to-day work. */
    label: "Serial detail",
    href: "/app/inventory/serial-lot/trace",
    permissionCode: "inventory.serial_trace",
    headerPriority: "overflow",
  },
  {
    label: "Pack station",
    href: "/app/inventory/serial-lot/pack-station",
    permissionCode: "inventory.pack_station",
    headerPriority: "overflow",
  },
  {
    label: "Receive (legacy)",
    href: "/app/inventory/serial-lot/receive",
    permissionCode: "inventory.serial_receive",
    headerPriority: "overflow",
  },
  {
    label: "Movements",
    href: "/app/inventory/serial-lot/movements",
    permissionCode: "inventory.serial_movements",
    headerPriority: "overflow",
  },
  {
    label: "Qty fix (serials)",
    href: "/app/inventory/serial-lot/adjustment",
    permissionCode: "inventory.serial_adjustment",
    headerPriority: "overflow",
  },
  {
    label: "Qty fix (lots)",
    href: "/app/inventory/serial-lot/lot-adjustment",
    permissionCode: "inventory.serial_adjustment",
    headerPriority: "overflow",
  },
  {
    label: "Status",
    href: "/app/inventory/serial-lot/reports/status",
    permissionCode: "inventory.serial_registry",
    headerPriority: "overflow",
  },
  {
    label: "Inv. Balance",
    href: "/app/inventory/serial-lot/reports/balance",
    permissionCode: "inventory.serial_registry",
    headerPriority: "overflow",
  },
  {
    label: "Reconciliation",
    href: "/app/inventory/serial-lot/reports/reconciliation",
    permissionCode: "inventory.serial_registry",
    headerPriority: "overflow",
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
