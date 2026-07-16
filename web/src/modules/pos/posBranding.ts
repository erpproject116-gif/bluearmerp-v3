/** Default POS copy — overridden per tenant via pos_settings.ui_labels. */
export const POS_UI_LABEL_DEFAULTS: Record<string, string> = {
  manage: "Manage",
  close_shift: "Close shift",
  exit_pos: "Exit POS",
  discount: "Discount",
  guests: "Guests",
  commission: "Commission",
  customer: "Customer",
  save_bill: "Save Bill",
  bills: "Bills",
  pay: "Charge",
  open_shift: "Open shift",
  open_shift_hint: "Pick your register location and starting cash to begin selling.",
  location: "Location",
  opening_cash: "Opening cash",
  clear_order: "Clear All Order",
  subtotal: "Subtotal",
  tax: "Tax",
  total: "Total",
  tip: "Tip (optional)",
  table: "Table / seat",
  payment: "Payment",
  confirm_pay: "Confirm",
  cancel: "Cancel",
  order_details: "Order Details",
  no_order: "No Order",
  no_order_hint: "Tap a product to add it to the order",
  search_placeholder: "Search products…",
};

export type PosTheme = {
  primary?: string;
  accent?: string;
  header_bg?: string;
  header_text?: string;
  surface?: string;
  button_text?: string;
};

export const POS_THEME_DEFAULTS: Required<PosTheme> = {
  primary: "#059669",
  accent: "#10b981",
  header_bg: "#ffffff",
  header_text: "#0f172a",
  surface: "#f1f5f9",
  button_text: "#ffffff",
};

export const POS_LABEL_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "manage", label: "Manage button" },
  { key: "close_shift", label: "Close shift button" },
  { key: "exit_pos", label: "Exit POS button" },
  { key: "discount", label: "Discount button" },
  { key: "guests", label: "Guests button (when covers set)" },
  { key: "commission", label: "Commission button" },
  { key: "customer", label: "Customer button" },
  { key: "save_bill", label: "Save bill button" },
  { key: "bills", label: "Bills button" },
  { key: "pay", label: "Pay / Charge button" },
  { key: "confirm_pay", label: "Confirm payment button" },
  { key: "cancel", label: "Cancel button" },
  { key: "open_shift", label: "Open shift title" },
  { key: "open_shift_hint", label: "Open shift hint" },
  { key: "location", label: "Location field" },
  { key: "opening_cash", label: "Opening cash field" },
  { key: "order_details", label: "Order panel heading" },
  { key: "clear_order", label: "Clear order button" },
  { key: "subtotal", label: "Subtotal label" },
  { key: "tax", label: "Tax label" },
  { key: "total", label: "Total label" },
  { key: "tip", label: "Tip field" },
  { key: "table", label: "Table / seat field" },
  { key: "payment", label: "Payment modal title" },
  { key: "no_order", label: "Empty cart title" },
  { key: "no_order_hint", label: "Empty cart hint" },
  { key: "search_placeholder", label: "Product search placeholder" },
];

export function resolvePosLabel(labels: Record<string, string> | undefined | null, key: string, fallback?: string): string {
  const custom = labels?.[key]?.trim();
  if (custom) return custom;
  return fallback ?? POS_UI_LABEL_DEFAULTS[key] ?? key;
}

export function resolvePosTheme(theme: PosTheme | undefined | null): Required<PosTheme> {
  return {
    primary: theme?.primary?.trim() || POS_THEME_DEFAULTS.primary,
    accent: theme?.accent?.trim() || POS_THEME_DEFAULTS.accent,
    header_bg: theme?.header_bg?.trim() || POS_THEME_DEFAULTS.header_bg,
    header_text: theme?.header_text?.trim() || POS_THEME_DEFAULTS.header_text,
    surface: theme?.surface?.trim() || POS_THEME_DEFAULTS.surface,
    button_text: theme?.button_text?.trim() || POS_THEME_DEFAULTS.button_text,
  };
}
