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
  repairOrder: "/app/after-sales/repair-orders/settings",
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

export const PURCHASE_REQUEST_ENTITY = {
  purchaseRequest: "pr_purchase_request",
  purchaseOrder: "po_purchase_order",
  goodsReceipt: "gr_goods_receipt",
  supplierInvoice: "fin_supplier_invoice",
} as const;

export const PURCHASE_REQUEST_SETTINGS_HREF = {
  purchaseRequest: "/app/purchase-request/purchase-requests/settings",
  purchaseOrder: "/app/purchase-order/purchase-orders/settings",
  goodsReceipt: "/app/purchase-order/goods-receipt/settings",
  supplierInvoice: "/app/purchases/purchase-receive/settings",
} as const;

export type PurchaseRequestFeature = keyof typeof PURCHASE_REQUEST_ENTITY;

/** Primary buy document UI (supplier invoice). Canonical app path — keep redirects from legacy `/app/purchases/purchases`. */
export const PURCHASE_RECEIVE_PATH = "/app/purchases/purchase-receive";
/** @deprecated Prefer PURCHASE_RECEIVE_PATH; kept for redirect targets and migrations. */
export const PURCHASE_RECEIVE_LEGACY_PATH = "/app/purchases/purchases";

export const PURCHASES_ENTITY = {
  purchases: "fin_supplier_invoice",
} as const;

export const PURCHASES_SETTINGS_HREF = {
  purchases: `${PURCHASE_RECEIVE_PATH}/settings`,
} as const;

export type PurchasesFeature = keyof typeof PURCHASES_ENTITY;

export const SALES_ENTITY = {
  sales: "sa_sales",
} as const;

export const SALES_SETTINGS_HREF = {
  sales: "/app/sales/sales/settings",
} as const;

export type SalesFeature = keyof typeof SALES_ENTITY;

export const FINANCE_ENTITY = {
  officialReceipt: "fin_official_receipt",
} as const;

export const FINANCE_SETTINGS_HREF = {
  officialReceipt: "/app/finance/official-receipts/settings",
} as const;

export type FinanceFeature = keyof typeof FINANCE_ENTITY;

export const OPERATIONS_ENTITY = {
  workItem: "ops_work_item",
} as const;

export const OPERATIONS_SETTINGS_HREF = {
  workItem: "/app/operations/work-items/settings",
} as const;

export type OperationsFeature = keyof typeof OPERATIONS_ENTITY;

export const CRM_ENTITY = {
  alertRule: "crm_alert_rule",
  followUpTask: "crm_follow_up_task",
  warrantyAsset: "crm_warranty_asset",
} as const;

export const CRM_SETTINGS_HREF = {
  alertRules: "/app/crm/settings/alert-rules",
  followUpTasks: "/app/crm/follow-up-tasks",
  warrantyAssets: "/app/crm/warranty-assets",
} as const;

export type CrmFeature = keyof typeof CRM_ENTITY;

export const HR_ENTITY = {
  employee: "hr_employee",
} as const;

export const HR_SETTINGS_HREF = {
  employee: "/app/hr/employees/settings",
} as const;

export type HrFeature = keyof typeof HR_ENTITY;

/** Entity type strings for the unsaved-form draft hook (`useDocumentDraft`). Reuses existing
 * entity constants where one already exists for that record type. */
export const DRAFT_ENTITY = {
  hrEmployee: "hr_employee",
  hrRemittance: "hr_remittance",
  hrAttendance: "hr_attendance",
  financeDefaults: "fin_account_defaults",
  finJournalEntry: "fin_journal_entry",
  finPaymentVoucher: "fin_payment_voucher",
  finOfficialReceipt: FINANCE_ENTITY.officialReceipt,
  soDeliveryReceipt: "so_delivery_receipt",
  posOrderUi: "pos_order_ui",
  invPartner: INVENTORY_ENTITY.partners,
  invItem: INVENTORY_ENTITY.items,
  invStockAdjustment: "inv_stock_adjustment",
  crmTask: "crm_task",
  crmLead: "crm_lead",
  crmOpportunity: "crm_opportunity",
  supportTicket: "support_ticket",
  mfgWorkOrder: "mfg_work_order",
  mfgBom: "mfg_bom",
  qaNcr: "qa_ncr",
  qaCapa: "qa_capa",
  fixedAsset: "fixed_asset",
  opsPack: "ops_pack",
  finAccount: "fin_account",
} as const;
