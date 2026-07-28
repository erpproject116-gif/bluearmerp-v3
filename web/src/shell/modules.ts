import { TAX_MNGT_PREFIX, isTaxMngtPath } from "./tax-mngt-nav";
import { COLLECTIVE_INVOICING_PREFIX } from "./collective-invoicing-nav";
import { SERIAL_LOT_PREFIX } from "./serial-lot-nav";
import { WMS_PREFIX } from "./wms-nav";
import { ACCT_I_PREFIX } from "./acct-i-nav";
import { ACCT_II_PREFIX, isAcctIIPath } from "./acct-ii-nav";
import { isReviewPurchasesPath, REVIEW_PURCHASES_SUB_BRANCH } from "./review-purchases-nav";
import { isSubBranchPath } from "./sub-branch-nav";
import { setupFeatureTab } from "../shared/moduleSetupScopes";
import { isTenantFeatureEnabled } from "../shared/moduleAccess";
import type { MeData } from "../shared/auth-context";

export { TAX_MNGT_PREFIX, COLLECTIVE_INVOICING_PREFIX, SERIAL_LOT_PREFIX, WMS_PREFIX, ACCT_I_PREFIX, ACCT_II_PREFIX, isSubBranchPath };

export type ModuleFeature = {
  label: string;
  href: string;
  settingsHref: string;
  /** Path prefix for sidebar sub-branch detection (e.g. /app/after-sales). */
  prefix?: string;
  /** Tenant feature registry code (migration 057 / 187). */
  featureCode?: string;
  /** Hidden from sales team; requires CRM analytics permission. */
  analyticsOnly?: boolean;
  /** Hidden unless user can manage CRM alert rules. */
  managersOnly?: boolean;
  /**
   * Header tab tier. When any feature on a module sets this, unmarked features
   * go to the More menu. Modules with no priorities keep all tabs primary.
   */
  headerPriority?: "primary" | "overflow";
};

export type AppModule = {
  id: string;
  label: string;
  href: string;
  basePath: string;
  features: ModuleFeature[];
  /** Sidebar-only branches (not shown in header feature tabs). */
  subBranches?: ModuleFeature[];
};

/** Sidebar shows modules + sub-branches; header shows module label + feature nav for the active branch. */
export const appModules: AppModule[] = [
  {
    id: "dashboard",
    label: "Home",
    href: "/app/dashboard",
    basePath: "/app/dashboard",
    features: [
      { label: "MyPage", href: "/app/dashboard", settingsHref: "/app/dashboard" },
      { label: "Approvals", href: "/app/dashboard/approvals", settingsHref: "/app/dashboard/approvals" },
      { label: "Site Map", href: "/app/dashboard/site-map", settingsHref: "/app/dashboard/site-map" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/app/reports",
    basePath: "/app/reports",
    features: [
      { label: "Catalog", href: "/app/reports", settingsHref: "/app/reports" },
      { label: "Saved Views", href: "/app/reports/saved-views", settingsHref: "/app/reports" },
    ],
  },
  {
    id: "inventory",
    label: "Stock",
    href: "/app/inventory",
    basePath: "/app/inventory",
    features: [
      { label: "Workspace", href: "/app/inventory", settingsHref: "/app/inventory", headerPriority: "primary" },
      { label: "Partners", href: "/app/inventory/partners", settingsHref: "/app/inventory/partners/settings", headerPriority: "primary" },
      { label: "Locations", href: "/app/inventory/locations", settingsHref: "/app/inventory/locations/settings" },
      { label: "Units", href: "/app/inventory/units", settingsHref: "/app/inventory/units" },
      { label: "Projects", href: "/app/inventory/projects", settingsHref: "/app/inventory/projects/settings" },
      { label: "Departments", href: "/app/inventory/departments", settingsHref: "/app/inventory/departments/settings" },
      { label: "Items", href: "/app/inventory/items", settingsHref: "/app/inventory/items/settings", headerPriority: "primary" },
      { label: "Stock Movements", href: "/app/inventory/stock-movements", settingsHref: "/app/inventory/stock-movements", headerPriority: "primary" },
      { label: "Stock Entries", href: "/app/inventory/stock-entries", settingsHref: "/app/inventory/stock-entries", headerPriority: "primary" },
      { label: "Stock Reconciliation", href: "/app/inventory/stock-reconciliation", settingsHref: "/app/inventory/stock-reconciliation" },
      { label: "Find Stock", href: "/app/inventory/find-stock", settingsHref: "/app/inventory/stock-movements", headerPriority: "primary" },
      { label: "Stock Balance", href: "/app/inventory/reports/stock-balance", settingsHref: "/app/inventory/stock-movements" },
      { label: "On Hand", href: "/app/inventory/reports/on-hand", settingsHref: "/app/inventory/stock-movements" },
      { label: "Inventory Status", href: "/app/inventory/reports/inventory-status", settingsHref: "/app/inventory/stock-movements" },
      { label: "Stock Ledger", href: "/app/inventory/reports/stock-ledger", settingsHref: "/app/inventory/stock-movements" },
      { label: "Inv. Book", href: "/app/inventory/reports/inv-book", settingsHref: "/app/inventory/stock-movements" },
      { label: "Stock Ageing", href: "/app/inventory/reports/stock-ageing", settingsHref: "/app/inventory/stock-movements" },
      { label: "Price List", href: "/app/inventory/price-lists", settingsHref: "/app/inventory/price-lists", featureCode: "inventory.price_lists" },
      { label: "Product Bundles", href: "/app/inventory/product-bundles", settingsHref: "/app/inventory/product-bundles" },
      { label: "BOMs", href: "/app/inventory/serial-lot/manufacturing/boms", settingsHref: "/app/inventory/serial-lot/manufacturing/boms", featureCode: "manufacturing.boms", headerPriority: "primary" },
      { label: "Work Orders", href: "/app/inventory/serial-lot/manufacturing/work-orders", settingsHref: "/app/inventory/serial-lot/manufacturing/work-orders", featureCode: "manufacturing.work_orders", headerPriority: "primary" },
    ],
    subBranches: [
      {
        label: "Batch & serial tracking",
        prefix: SERIAL_LOT_PREFIX,
        href: "/app/inventory/serial-lot/registry",
        settingsHref: "/app/inventory/serial-lot/settings",
        featureCode: "inventory.serial_lot",
      },
      {
        label: "Warehouse",
        prefix: WMS_PREFIX,
        href: "/app/inventory/wms/scheduled-receipts",
        settingsHref: "/app/inventory/wms/scheduled-receipts",
        featureCode: "inventory.wms",
      },
    ],
  },
  {
    id: "buying",
    label: "Buy overview",
    href: "/app/buying",
    basePath: "/app/buying",
    features: [
      { label: "Workspace", href: "/app/buying", settingsHref: "/app/buying", headerPriority: "primary" },
      { label: "Expenses", href: "/app/purchases/expenses", settingsHref: "/app/purchases/expenses", featureCode: "finance.expenses", headerPriority: "primary" },
      { label: "Reports", href: "/app/buying/reports", settingsHref: "/app/buying", headerPriority: "primary" },
      { label: "Purchase Status", href: "/app/purchases/purchases/status", settingsHref: "/app/purchases/purchases/settings" },
      { label: "Pre-Invoicing (Purchases)", href: "/app/purchases/purchases/pre-invoicing", settingsHref: "/app/purchases/purchases/settings" },
      setupFeatureTab("/app/buying"),
    ],
  },
  {
    id: "selling",
    label: "Sell overview",
    href: "/app/selling",
    basePath: "/app/selling",
    features: [
      { label: "Workspace", href: "/app/selling", settingsHref: "/app/selling", headerPriority: "primary" },
      { label: "Reports", href: "/app/selling/reports", settingsHref: "/app/sales/sales/settings", headerPriority: "primary" },
      { label: "Sales Status", href: "/app/selling/reports", settingsHref: "/app/sales/sales/settings" },
      { label: "Receivable Status", href: "/app/selling/reports/receivable-status", settingsHref: "/app/sales/sales/settings" },
      { label: "Commissions", href: "/app/selling/commissions", settingsHref: "/app/selling/commissions" },
      setupFeatureTab("/app/selling"),
    ],
  },
  {
    id: "after_sales",
    label: "After-Sales",
    href: "/app/after-sales/repair-orders",
    basePath: "/app/after-sales",
    features: [
      {
        label: "Repair Orders",
        href: "/app/after-sales/repair-orders",
        settingsHref: "/app/after-sales/repair-orders/settings",
        prefix: "/app/after-sales/repair-orders",
        headerPriority: "primary",
      },
      {
        label: "Status",
        href: "/app/after-sales/repair-orders/status",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "Customer Intake",
        href: "/app/after-sales/register-repair",
        settingsHref: "/app/after-sales/repair-orders/settings",
        prefix: "/app/after-sales/register-repair",
        headerPriority: "primary",
      },
      {
        label: "Intake Status",
        href: "/app/after-sales/register-repair/status",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "Parts Consumption",
        href: "/app/after-sales/register-repair/consumption",
        settingsHref: "/app/after-sales/repair-orders/settings",
      },
      {
        label: "Warranty coverage",
        href: "/app/crm/warranty-assets",
        settingsHref: "/app/crm/settings/alert-rules",
      },
    ],
  },
  {
    id: "quotation",
    label: "Quotation",
    href: "/app/quotation/quotations",
    basePath: "/app/quotation",
    features: [
      { label: "List", href: "/app/quotation/quotations", settingsHref: "/app/quotation/quotations/settings", headerPriority: "primary" },
      { label: "Status", href: "/app/quotation/quotations/status", settingsHref: "/app/quotation/quotations/settings" },
      {
        label: "Open quotes",
        href: "/app/quotation/quotations/outstanding",
        settingsHref: "/app/quotation/quotations/settings",
      },
      {
        label: "Quote board",
        href: "/app/crm/pipelines/quotations",
        settingsHref: "/app/crm/settings/alert-rules",
      },
      setupFeatureTab("/app/quotation"),
    ],
  },
  {
    id: "sales",
    label: "Sales invoices",
    href: "/app/sales/sales",
    basePath: "/app/sales",
    features: [
      { label: "Sales Invoice List", href: "/app/sales/sales", settingsHref: "/app/sales/sales/settings", headerPriority: "primary" },
      { label: "Reports", href: "/app/selling/reports", settingsHref: "/app/sales/sales/settings", headerPriority: "primary" },
      { label: "Sales Invoice Status", href: "/app/sales/sales/status", settingsHref: "/app/sales/sales/settings" },
      {
        label: "Pre-invoicing",
        href: "/app/sales/sales/pre-invoicing",
        settingsHref: "/app/sales/sales/settings",
      },
      {
        label: "Price batch",
        href: "/app/sales/sales/price-batch",
        settingsHref: "/app/sales/sales/settings",
      },
      { label: "Discount status", href: "/app/sales/reports/discount-status", settingsHref: "/app/sales/sales/settings" },
      { label: "Print slips", href: "/app/sales/reports/print-slips", settingsHref: "/app/sales/sales/settings" },
      { label: "Returns", href: "/app/sales/sales-returns", settingsHref: "/app/sales/sales/settings" },
      { label: "Commissions", href: "/app/sales/commission-rules", settingsHref: "/app/sales/commission-rules?tab=accounting" },
      { label: "SI receipts", href: "/app/sales/reports/si-receipt-status", settingsHref: "/app/sales/sales/settings" },
      { label: "Customer credit", href: "/app/sales/reports/customer-credit-balance", settingsHref: "/app/sales/sales/settings" },
      { label: "AR by customer", href: "/app/sales/reports/ar-by-customer", settingsHref: "/app/sales/sales/settings" },
      setupFeatureTab("/app/sales"),
    ],
    subBranches: [
      {
        label: "Combined invoices",
        prefix: COLLECTIVE_INVOICING_PREFIX,
        href: "/app/sales/collective-invoicing/list",
        settingsHref: "/app/sales/sales/settings",
        featureCode: "sales.collective_invoicing",
      },
    ],
  },
  {
    id: "sales_order",
    label: "Sales Order",
    href: "/app/sales-order/sales-orders",
    basePath: "/app/sales-order",
    features: [
      { label: "List", href: "/app/sales-order/sales-orders", settingsHref: "/app/sales-order/sales-orders/settings", headerPriority: "primary" },
      { label: "Reports", href: "/app/sales-order/reports", settingsHref: "/app/sales-order/sales-orders/settings", headerPriority: "primary" },
      { label: "Status", href: "/app/sales-order/sales-orders/status", settingsHref: "/app/sales-order/sales-orders/settings" },
      {
        label: "Open orders",
        href: "/app/sales-order/sales-orders/outstanding",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      {
        label: "Pick list",
        href: "/app/sales-order/sales-orders/release",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      {
        label: "Delivery notes",
        href: "/app/sales-order/delivery-receipts",
        settingsHref: "/app/sales-order/sales-orders/settings",
      },
      { label: "SO Analysis", href: "/app/sales-order/reports/so-analysis", settingsHref: "/app/sales-order/sales-orders/settings" },
      { label: "Shipment Status", href: "/app/sales-order/reports/shipment-status", settingsHref: "/app/sales-order/sales-orders/settings" },
      { label: "Pending Shipment", href: "/app/sales-order/reports/pending-shipment", settingsHref: "/app/sales-order/sales-orders/settings" },
      { label: "Shipping Order Status", href: "/app/sales-order/reports/shipping-order-status", settingsHref: "/app/sales-order/sales-orders/settings" },
      { label: "Shipping Orders", href: "/app/sales-order/shipping/orders", settingsHref: "/app/sales-order/shipping/orders" },
      { label: "Shipping Rules", href: "/app/sales-order/shipping/rules", settingsHref: "/app/sales-order/shipping/rules" },
      { label: "Delivery Trips", href: "/app/sales-order/shipping/trips", settingsHref: "/app/sales-order/shipping/trips" },
      setupFeatureTab("/app/sales-order"),
    ],
  },
  {
    id: "purchase_request",
    label: "Purchase Request",
    href: "/app/purchase-request/purchase-requests",
    basePath: "/app/purchase-request",
    features: [
      { label: "List", href: "/app/purchase-request/purchase-requests", settingsHref: "/app/purchase-request/purchase-requests/settings", headerPriority: "primary" },
      { label: "Status", href: "/app/purchase-request/purchase-requests/status", settingsHref: "/app/purchase-request/purchase-requests/settings" },
      setupFeatureTab("/app/purchase-request"),
    ],
  },
  {
    id: "purchase_order",
    label: "Purchase Order",
    href: "/app/purchase-order/purchase-orders",
    basePath: "/app/purchase-order",
    features: [
      { label: "List", href: "/app/purchase-order/purchase-orders", settingsHref: "/app/purchase-order/purchase-orders/settings", headerPriority: "primary" },
      { label: "Reports", href: "/app/buying/reports", settingsHref: "/app/purchase-order/purchase-orders/settings", headerPriority: "primary" },
      {
        label: "RFQ",
        href: "/app/purchase-order/rfq",
        settingsHref: "/app/purchase-order/purchase-orders/settings",
        prefix: "/app/purchase-order/rfq",
      },
      { label: "Returns", href: "/app/purchase-order/purchase-returns", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      { label: "Receiving", href: "/app/purchase-order/goods-receipt", settingsHref: "/app/purchase-order/goods-receipt/settings" },
      { label: "PO analysis", href: "/app/purchase-order/reports/po-analysis", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      { label: "PO status", href: "/app/purchase-order/purchase-orders/status", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      { label: "Open POs", href: "/app/purchase-order/purchase-orders/outstanding", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      { label: "To receive", href: "/app/purchase-order/reports/items-to-receive", settingsHref: "/app/purchase-order/purchase-orders/settings" },
      setupFeatureTab("/app/purchase-order"),
    ],
  },
  {
    id: "purchases",
    label: "Purchase invoices",
    href: "/app/purchases/purchases",
    basePath: "/app/purchases",
    features: [
      { label: "Purchase Invoice List", href: "/app/purchases/purchases", settingsHref: "/app/purchases/purchases/settings", headerPriority: "primary" },
      { label: "Expenses", href: "/app/purchases/expenses", settingsHref: "/app/purchases/expenses", featureCode: "finance.expenses", headerPriority: "primary" },
      { label: "Reports", href: "/app/buying/reports", settingsHref: "/app/purchases/purchases/settings", headerPriority: "primary" },
      { label: "Purchase Invoice Status", href: "/app/purchases/purchases/status", settingsHref: "/app/purchases/purchases/settings" },
      {
        label: "Pre-invoicing",
        href: "/app/purchases/purchases/pre-invoicing",
        settingsHref: "/app/purchases/purchases/settings",
      },
      {
        label: "Payment status",
        href: "/app/purchases/purchases/payment-status",
        settingsHref: "/app/purchases/purchases/settings",
      },
      {
        label: "A/P by vendor",
        href: "/app/purchases/purchases/ap-by-vendor",
        settingsHref: "/app/purchases/purchases/settings",
      },
      setupFeatureTab("/app/purchases"),
    ],
  },
  {
    id: "crm",
    label: "CRM",
    href: "/app/crm/dashboard",
    basePath: "/app/crm",
    features: [
      { label: "My pipeline", href: "/app/crm/dashboard", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Leads dashboard", href: "/app/crm/leads/dashboard", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Notifications", href: "/app/crm/notifications", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Follow-up Tasks", href: "/app/crm/follow-up-tasks", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Leads", href: "/app/crm/leads", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Clients", href: "/app/crm/clients", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Opportunities", href: "/app/crm/opportunities", settingsHref: "/app/crm/settings/alert-rules" },
      {
        label: "Quote board",
        href: "/app/crm/pipelines/quotations",
        settingsHref: "/app/crm/settings/alert-rules",
      },
      { label: "Warranty coverage", href: "/app/crm/warranty-assets", settingsHref: "/app/crm/settings/alert-rules" },
      { label: "Alert Rules", href: "/app/crm/settings/alert-rules", settingsHref: "/app/crm/settings/alert-rules", managersOnly: true },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    href: "/app/quality/ncrs",
    basePath: "/app/quality",
    features: [
      { label: "NCRs", href: "/app/quality/ncrs", settingsHref: "/app/quality/ncrs" },
      { label: "QC Requests", href: "/app/quality/qc-requests", settingsHref: "/app/quality/ncrs" },
      { label: "CAPA", href: "/app/quality/capa", settingsHref: "/app/quality/ncrs" },
    ],
  },
  {
    id: "support",
    label: "Support",
    href: "/app/support/tickets",
    basePath: "/app/support",
    features: [
      { label: "Tickets", href: "/app/support/tickets", settingsHref: "/app/support/tickets" },
    ],
  },
  {
    id: "booking",
    label: "Booking",
    href: "/app/booking/bookings",
    basePath: "/app/booking",
    features: [
      { label: "Calendar", href: "/app/booking/calendar", settingsHref: "/app/booking/calendar" },
      { label: "Bookings", href: "/app/booking/bookings", settingsHref: "/app/booking/bookings" },
      { label: "Resources", href: "/app/booking/resources", settingsHref: "/app/booking/resources" },
      { label: "Services", href: "/app/booking/services", settingsHref: "/app/booking/services" },
    ],
  },
  {
    id: "comms",
    label: "Communications",
    href: "/app/comms/sent-documents",
    basePath: "/app/comms",
    features: [
      { label: "Inbox", href: "/app/comms/inbox", settingsHref: "/app/comms/settings" },
      { label: "Sent Documents", href: "/app/comms/sent-documents", settingsHref: "/app/comms/settings" },
      { label: "Settings", href: "/app/comms/settings", settingsHref: "/app/comms/settings" },
    ],
  },
  {
    id: "operations",
    label: "Project Management",
    href: "/app/operations",
    basePath: "/app/operations",
    features: [
      { label: "Work hub", href: "/app/operations", settingsHref: "/app/operations/work-items/settings" },
      { label: "Industry packs", href: "/app/operations/packs", settingsHref: "/app/operations/packs" },
      { label: "Calendar", href: "/app/operations/calendar", settingsHref: "/app/operations/calendar" },
      { label: "Timeline", href: "/app/operations/timeline", settingsHref: "/app/operations/timeline" },
      { label: "Project dashboard", href: "/app/operations/dashboard", settingsHref: "/app/operations/dashboard" },
      { label: "Tasks dashboard", href: "/app/operations/tasks", settingsHref: "/app/operations/dashboard" },
      { label: "Job costing", href: "/app/operations/job-costing", settingsHref: "/app/operations/job-costing" },
      { label: "Automation", href: "/app/operations/automation", settingsHref: "/app/operations/automation" },
    ],
  },
  {
    id: "sop",
    label: "SOP",
    href: "/app/sop",
    basePath: "/app/sop",
    features: [
      { label: "Library", href: "/app/sop", settingsHref: "/app/sop" },
      { label: "Dashboard", href: "/app/sop/dashboard", settingsHref: "/app/sop/dashboard" },
    ],
  },
  {
    id: "okr",
    label: "OKRs",
    href: "/app/okr",
    basePath: "/app/okr",
    features: [
      { label: "Objectives", href: "/app/okr", settingsHref: "/app/okr" },
      { label: "Dashboard", href: "/app/okr/dashboard", settingsHref: "/app/okr/dashboard" },
    ],
  },
  {
    id: "pos",
    label: "POS",
    href: "/app/pos",
    basePath: "/app/pos",
    features: [
      { label: "Terminal", href: "/app/pos", settingsHref: "/app/pos" },
      { label: "Manage", href: "/app/pos/manage", settingsHref: "/app/pos/manage", managersOnly: true },
      setupFeatureTab("/app/pos"),
    ],
  },
  {
    id: "hr",
    label: "HR & Payroll",
    href: "/app/hr/employees",
    basePath: "/app/hr",
    features: [
      { label: "Employees", href: "/app/hr/employees", settingsHref: "/app/hr/employees/settings" },
      { label: "Attendance / DTR", href: "/app/hr/attendance", settingsHref: "/app/hr/attendance" },
      { label: "Leave", href: "/app/hr/leave", settingsHref: "/app/hr/leave" },
      { label: "Absenteeism", href: "/app/hr/absenteeism", settingsHref: "/app/hr/absenteeism" },
      { label: "Discipline", href: "/app/hr/discipline", settingsHref: "/app/hr/discipline" },
      { label: "Hire onboarding", href: "/app/hr/hire-onboarding", settingsHref: "/app/hr/hire-onboarding" },
      { label: "Evaluations", href: "/app/hr/evaluations", settingsHref: "/app/hr/evaluations" },
      { label: "Learning", href: "/app/hr/learning", settingsHref: "/app/hr/learning" },
      { label: "Pay items", href: "/app/hr/pay-items", settingsHref: "/app/hr/pay-items" },
      { label: "Payroll", href: "/app/hr/payroll-runs", settingsHref: "/app/hr/payroll-runs" },
      { label: "13th / Final pay", href: "/app/hr/special-runs", settingsHref: "/app/hr/special-runs" },
      { label: "Remittances", href: "/app/hr/remittances", settingsHref: "/app/hr/remittances" },
      { label: "My HR (ESS)", href: "/app/hr/ess", settingsHref: "/app/hr/ess" },
    ],
  },
  {
    id: "fixed_assets",
    label: "Fixed Assets",
    href: "/app/fixed-assets",
    basePath: "/app/fixed-assets",
    features: [
      { label: "Asset Register", href: "/app/fixed-assets", settingsHref: "/app/fixed-assets" },
    ],
  },
  {
    id: "finance",
    label: "Accounting overview",
    href: "/app/finance",
    basePath: "/app/finance",
    features: [
      { label: "Workspace", href: "/app/finance", settingsHref: "/app/finance/official-receipts/settings", headerPriority: "primary" },
      { label: "Reports", href: "/app/finance/reports", settingsHref: "/app/finance/official-receipts/settings", headerPriority: "primary" },
      { label: "Receipts", href: "/app/finance/official-receipts", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "Vouchers", href: "/app/finance/payment-vouchers", settingsHref: "/app/finance/official-receipts/settings" },
      { label: "Budgets", href: "/app/finance/budgets", settingsHref: "/app/finance/budgets" },
      { label: "Payroll", href: "/app/hr/payroll-runs", settingsHref: "/app/hr/payroll-runs" },
      { label: "Remittances", href: "/app/hr/remittances", settingsHref: "/app/hr/remittances" },
      { label: "Assets", href: "/app/fixed-assets", settingsHref: "/app/fixed-assets" },
      setupFeatureTab("/app/finance"),
    ],
    subBranches: [
      {
        label: "Ledger",
        prefix: ACCT_I_PREFIX,
        href: "/app/finance/acct-i/journal-entries",
        settingsHref: "/app/finance/acct-i/journal-entries",
        featureCode: "finance.acct_i",
      },
      {
        label: "Receivables & payables",
        prefix: ACCT_II_PREFIX,
        href: "/app/finance/acct-ii/checks",
        settingsHref: "/app/finance/acct-ii/setup",
        featureCode: "finance.acct_ii",
      },
      {
        label: "Taxes",
        prefix: TAX_MNGT_PREFIX,
        href: "/app/quotation/tax-mngt/tax-types",
        settingsHref: "/app/quotation/tax-mngt/tax-types/settings",
        featureCode: "quotation.tax_mngt",
      },
      {
        label: "Supplier payments",
        prefix: REVIEW_PURCHASES_SUB_BRANCH,
        href: "/app/finance/payment-vouchers",
        settingsHref: "/app/finance/official-receipts/settings",
        featureCode: "finance.payment_vouchers",
      },
    ],
  },
  {
    id: "data_center",
    label: "Data Center",
    href: "/app/data-center/ingestion-rules",
    basePath: "/app/data-center",
    features: [
      { label: "Ingestion rules", href: "/app/data-center/ingestion-rules", settingsHref: "/app/data-center/ingestion-rules" },
      { label: "Import inbox", href: "/app/data-center/inbox", settingsHref: "/app/data-center/inbox" },
    ],
  },
  {
    id: "activity_logs",
    label: "Activity Logs",
    href: "/app/activity-logs",
    basePath: "/app/activity-logs",
    features: [
      {
        label: "All activity",
        href: "/app/activity-logs",
        settingsHref: "/app/activity-logs",
      },
      {
        label: "Change log",
        href: "/app/activity-logs/changes",
        settingsHref: "/app/activity-logs/changes",
      },
    ],
  },
  {
    id: "documentation",
    label: "Help & guides",
    href: "/app/documentation",
    basePath: "/app/documentation",
    features: [
      { label: "Help & guides", href: "/app/documentation", settingsHref: "/app/documentation" },
    ],
  },
  {
    id: "user_management",
    label: "User Management",
    href: "/app/user-management/users",
    basePath: "/app/user-management",
    features: [
      {
        label: "Users",
        href: "/app/user-management/users",
        settingsHref: "/app/user-management/users",
      },
      {
        label: "Roles",
        href: "/app/user-management/roles",
        settingsHref: "/app/user-management/roles",
      },
      {
        label: "Groups",
        href: "/app/user-management/groups",
        settingsHref: "/app/user-management/groups",
      },
      {
        label: "Data scopes",
        href: "/app/user-management/user-permissions",
        settingsHref: "/app/user-management/user-permissions",
      },
      {
        label: "Module & Features",
        href: "/app/user-management/tenant-modules",
        settingsHref: "/app/user-management/tenant-modules",
      },
      {
        label: "Process Policies",
        href: "/app/user-management/process-policies",
        settingsHref: "/app/user-management/process-policies",
      },
      {
        label: "Mapping Center",
        href: "/app/user-management/mapping-center",
        settingsHref: "/app/user-management/mapping-center",
      },
      {
        label: "Migration Center",
        href: "/app/user-management/migration-center",
        settingsHref: "/app/user-management/migration-center",
      },
      {
        label: "Demo Data",
        href: "/app/user-management/demo-data",
        settingsHref: "/app/user-management/demo-data",
      },
      {
        label: "Help feedback",
        href: "/app/user-management/help-feedback",
        settingsHref: "/app/user-management/help-feedback",
      },
    ],
  },
];

export function resolveModule(pathname: string): AppModule | undefined {
  const finance = () => appModules.find((m) => m.id === "finance");

  if (
    isReviewPurchasesPath(pathname) ||
    isTaxMngtPath(pathname) ||
    pathname === "/app/hr/payroll-runs" ||
    pathname.startsWith("/app/hr/payroll-runs/") ||
    pathname === "/app/fixed-assets" ||
    pathname.startsWith("/app/fixed-assets/") ||
    pathname === "/app/sales/reports/ar-by-customer" ||
    pathname === "/app/sales/reports/official-receipt-status" ||
    pathname === "/app/sales/reports/si-receipt-status" ||
    pathname === "/app/sales/reports/customer-credit-balance"
  ) {
    return finance();
  }

  return appModules.find((m) => pathname === m.basePath || pathname.startsWith(`${m.basePath}/`));
}

function matchesSubBranch(pathname: string, branch: ModuleFeature): boolean {
  if (branch.prefix === REVIEW_PURCHASES_SUB_BRANCH) {
    return isReviewPurchasesPath(pathname);
  }
  if (branch.prefix === ACCT_II_PREFIX) {
    return isAcctIIPath(pathname);
  }
  return (
    branch.href === pathname ||
    branch.settingsHref === pathname ||
    (branch.prefix != null && isSubBranchPath(pathname, branch.prefix))
  );
}

export function resolveSubBranch(module: AppModule, pathname: string): ModuleFeature | undefined {
  return module.subBranches?.find((b) => matchesSubBranch(pathname, b));
}

export function resolveFeature(module: AppModule, pathname: string): ModuleFeature | undefined {
  const exact = (f: ModuleFeature) => f.href === pathname || f.settingsHref === pathname;
  const prefix = (f: ModuleFeature) =>
    (f.prefix != null && isSubBranchPath(pathname, f.prefix)) ||
    (pathname.startsWith(f.href + "/") && f.href !== module.basePath);

  return (
    module.features.find(exact) ??
    module.features.find(prefix) ??
    module.subBranches?.find((b) => matchesSubBranch(pathname, b))
  );
}

export function isFeatureSettings(pathname: string, feature: ModuleFeature): boolean {
  if (feature.settingsHref === feature.href) return false;
  return pathname === feature.settingsHref;
}

export function featureHeaderTitle(feature: ModuleFeature, pathname: string): string {
  return isFeatureSettings(pathname, feature) ? `${feature.label} settings` : feature.label;
}

/** Header tabs: drop redundant New-* shortcuts and report clutter. Always keep Setup. */
export function visibleHeaderFeatures(module: AppModule, me?: MeData | null): ModuleFeature[] {
  let features = module.features.filter((feature) => {
    if (feature.href.endsWith("/setup")) return true;
    if (feature.href.endsWith("/new")) return false;
    if (module.id === "inventory" && feature.href.includes("/reports/")) return false;
    if (module.id === "finance" && feature.href.includes("/reports/")) return false;
    if (feature.featureCode && me) {
      return isTenantFeatureEnabled(me, feature.featureCode, module.id);
    }
    return true;
  });
  if (features.length === 1 && features[0].href === module.href) {
    return [];
  }
  return features;
}

export type HeaderFeatureSplit = {
  primary: ModuleFeature[];
  overflow: ModuleFeature[];
};

/** Split visible header features into primary tabs vs More menu. */
export function splitHeaderFeatures(module: AppModule, me?: MeData | null): HeaderFeatureSplit {
  const all = visibleHeaderFeatures(module, me);
  const hasExplicit = all.some((f) => f.headerPriority != null);
  if (!hasExplicit) {
    return { primary: all, overflow: [] };
  }
  return {
    primary: all.filter((f) => f.headerPriority === "primary"),
    overflow: all.filter((f) => f.headerPriority !== "primary"),
  };
}
