export const INVENTORY_ENTITY = {
  partners: "inv_partner",
  locations: "inv_location",
  projects: "inv_project",
  departments: "inv_department",
  items: "inv_item",
  repairOrder: "inv_repair_order",
} as const;

export const INVENTORY_SETTINGS_HREF = {
  partners: "/app/inventory/partners/settings",
  locations: "/app/inventory/locations/settings",
  projects: "/app/inventory/projects/settings",
  departments: "/app/inventory/departments/settings",
  items: "/app/inventory/items/settings",
  repairOrder: "/app/inventory/after-sales/repair-orders/settings",
} as const;

export type InventoryFeature = keyof typeof INVENTORY_ENTITY;

export const QUOTATION_ENTITY = {
  taxType: "quo_tax_type",
  currency: "quo_currency",
  quotation: "quo_quotation",
} as const;

export const QUOTATION_SETTINGS_HREF = {
  taxType: "/app/quotation/tax-mngt/tax-types/settings",
  currency: "/app/quotation/tax-mngt/currencies/settings",
  quotation: "/app/quotation/quotations/settings",
} as const;

export type QuotationFeature = keyof typeof QUOTATION_ENTITY;

export const SALES_ORDER_ENTITY = {
  salesOrder: "so_sales_order",
} as const;

export const SALES_ORDER_SETTINGS_HREF = {
  salesOrder: "/app/sales-order/sales-orders/settings",
} as const;

export type SalesOrderFeature = keyof typeof SALES_ORDER_ENTITY;
