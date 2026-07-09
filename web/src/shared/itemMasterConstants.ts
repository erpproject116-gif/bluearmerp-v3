export const PRICE_LEVEL_KEYS = ["B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

export type PriceLevelKey = (typeof PRICE_LEVEL_KEYS)[number];

export const SAFETY_DOC_TYPES = [
  { key: "quotation", label: "Quotation" },
  { key: "sales_order", label: "Sales Order" },
  { key: "shipping_order", label: "Shipping Order" },
  { key: "sales", label: "Sales" },
  { key: "goods_receipt", label: "Goods Receipt" },
  { key: "purchase_order", label: "Purchase Order" },
  { key: "purchase", label: "Purchase" },
] as const;

export const SERIAL_SLIP_TYPE_OPTIONS = [
  { value: "", label: "All slip types" },
  { value: "goods_receipt", label: "Goods Receipt" },
  { value: "sales", label: "Sales" },
  { value: "sales_order", label: "Sales Order" },
  { value: "shipping_order", label: "Shipping Order" },
  { value: "serial_adjustment", label: "Serial Adjustment" },
  { value: "lot_adjustment", label: "Lot Adjustment" },
  { value: "lot_register", label: "Lot Register" },
  { value: "quotation", label: "Quotation" },
  { value: "purchase_order", label: "Purchase Order" },
];

export const TRACKING_POLICY_OPTIONS = [
  { value: "required", label: "Required on transactions" },
  { value: "optional", label: "Optional on transactions" },
] as const;

export function trackingPolicyLabel(policy?: string): string {
  return policy === "optional" ? "Optional" : "Required";
}

export function emptyPriceLevels(): Record<string, number> {
  return Object.fromEntries(PRICE_LEVEL_KEYS.map((k) => [k, 0]));
}

export function emptySafetyStockByDoc(): Record<string, number | null> {
  return Object.fromEntries(SAFETY_DOC_TYPES.map((d) => [d.key, null]));
}
