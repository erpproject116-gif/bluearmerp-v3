/** POS register setup rows and catalog tile border classes. Pure helpers for the panel and tests. */

export const POS_SETUP_FOCI = [
  "default_location",
  "default_tax_type",
  "enable_barcode",
  "require_customer",
] as const;

export type PosSetupFocus = (typeof POS_SETUP_FOCI)[number];

export type PosSetupSettings = {
  default_location_id?: number | null;
  default_location_name?: string;
  default_tax_type_id?: number | null;
  enable_barcode?: boolean;
  require_customer?: boolean;
};

export type PosSetupRow = {
  id: PosSetupFocus | "tracking_stop";
  name: string;
  sentence: string;
  required: boolean;
  set: boolean;
  value: string;
  focus: PosSetupFocus | null;
};

export function parsePosSetupFocus(raw: string | null | undefined): PosSetupFocus | null {
  if (!raw) return null;
  return (POS_SETUP_FOCI as readonly string[]).includes(raw) ? (raw as PosSetupFocus) : null;
}

/** Element id to scroll to. Null means do not scroll. */
export function posSetupScrollTarget(raw: string | null | undefined): string | null {
  const focus = parsePosSetupFocus(raw);
  if (!focus) return null;
  return `pos-setup-${focus}`;
}

export function posSetupFieldValue(focus: PosSetupFocus, settings: PosSetupSettings): string {
  switch (focus) {
    case "default_location":
      return settings.default_location_id != null && settings.default_location_id > 0
        ? String(settings.default_location_id)
        : "";
    case "default_tax_type":
      return settings.default_tax_type_id != null && settings.default_tax_type_id > 0
        ? String(settings.default_tax_type_id)
        : "";
    case "enable_barcode":
      return settings.enable_barcode ? "1" : "0";
    case "require_customer":
      return settings.require_customer ? "1" : "0";
  }
}

export function posSetupOutlineActive(
  focusRaw: string | null | undefined,
  baseline: string | null,
  current: string,
): boolean {
  if (!parsePosSetupFocus(focusRaw) || baseline === null) return false;
  return current === baseline;
}

export function posTileBorderClass(stockStatus: string | undefined): string {
  if (stockStatus === "sold_out") return "border pos-stock-breathe pos-stock-breathe-sold";
  if (stockStatus === "low") return "border pos-stock-breathe pos-stock-breathe-low";
  return "border border-slate-200 transition hover:border-emerald-400 hover:shadow-md";
}

export function posSetupRows(
  settings: PosSetupSettings,
  opts: { shellScans: boolean; taxLabel: string },
): PosSetupRow[] {
  const locationSet = settings.default_location_id != null && settings.default_location_id > 0;
  const taxSet = settings.default_tax_type_id != null && settings.default_tax_type_id > 0;
  const barcodeSet = !!settings.enable_barcode || opts.shellScans;
  const customerStops = !!settings.require_customer;
  return [
    {
      id: "default_location",
      name: "Default location",
      sentence: "Set Default location. A new shift uses this stock location when no location is chosen.",
      required: true,
      set: locationSet,
      value: locationSet ? settings.default_location_name?.trim() || "Set" : "Not set",
      focus: "default_location",
    },
    {
      id: "default_tax_type",
      name: "Default tax type",
      sentence: "Set Default tax type. The receipt uses this tax. An empty tax type posts no tax.",
      required: true,
      set: taxSet,
      value: taxSet ? opts.taxLabel.trim() || "Set" : "Not set",
      focus: "default_tax_type",
    },
    {
      id: "enable_barcode",
      name: "Barcode scanning",
      sentence: "Turn on Enable barcode scanning. The cashier can scan the item.",
      required: true,
      set: barcodeSet,
      value: barcodeSet ? "On" : "Not set",
      focus: "enable_barcode",
    },
    {
      id: "require_customer",
      name: "Customer on each sale",
      sentence: customerStops ? "Require customer selection is on. Turn it off for walk-in sales." : "",
      required: false,
      set: !customerStops,
      value: customerStops ? "On — each sale stops for a customer" : "Off",
      focus: "require_customer",
    },
  ];
}

export function posSetupRequiredOpen(rows: PosSetupRow[]): boolean {
  return rows.some((row) => row.required && !row.set);
}
