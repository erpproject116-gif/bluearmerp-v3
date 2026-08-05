export const PRICE_LEVEL_KEYS = ["B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

export type PriceLevelKey = (typeof PRICE_LEVEL_KEYS)[number];

export const SAFETY_DOC_TYPES = [
  { key: "quotation", label: "Quotation" },
  { key: "sales_order", label: "Sales Order" },
  { key: "shipping_order", label: "Shipping Order" },
  { key: "sales", label: "Sales" },
  { key: "goods_receipt", label: "Purchase Receive" },
  { key: "purchase_order", label: "Purchase Order" },
  { key: "purchase", label: "Bill" },
] as const;

export const SERIAL_SLIP_TYPE_OPTIONS = [
  { value: "", label: "All slip types" },
  { value: "goods_receipt", label: "Purchase Receive" },
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
  { value: "optional", label: "Optional on transactions" },
  { value: "required", label: "Required on transactions" },
] as const;

export const ITEM_CATEGORY_OPTIONS = [
  { value: "raw_material", label: "Raw Material" },
  { value: "sub_material", label: "Sub Material" },
  { value: "finished_goods", label: "Finished Goods" },
  { value: "semi_finished_goods", label: "Semi-Finished Goods" },
  { value: "merchandise", label: "Merchandise" },
  { value: "intangible_merchandise", label: "Intangible Merchandise" },
] as const;

export const ITEM_TYPE_OPTIONS = [
  { value: "item", label: "Item" },
  { value: "multiple_process_item", label: "Multiple Process Item" },
  { value: "multi_spec_item", label: "Multi Spec. Item" },
] as const;

export const PRODUCTION_PROCESS_OPTIONS = [
  { value: "", label: "None" },
  { value: "bundle", label: "Bundle" },
  { value: "service", label: "Service" },
] as const;

export type StandardCosts = {
  material: number;
  labor: number;
  expenses: number;
  overhead: number;
};

export function emptyStandardCosts(): StandardCosts {
  return { material: 0, labor: 0, expenses: 0, overhead: 0 };
}

export function trackingPolicyLabel(policy?: string): string {
  return policy === "optional" ? "Optional" : "Required";
}

export function emptyPriceLevels(): Record<string, number> {
  return Object.fromEntries(PRICE_LEVEL_KEYS.map((k) => [k, 0]));
}

export function emptySafetyStockByDoc(): Record<string, number | null> {
  return Object.fromEntries(SAFETY_DOC_TYPES.map((d) => [d.key, null]));
}
