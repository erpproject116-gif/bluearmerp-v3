import type { KbGroup } from "./documentationTypes";

export const knowledgebaseGroups: KbGroup[] = [
  {
    id: "account",
    title: "Account & businesses",
    description: "One login, multiple company workspaces, and invites.",
    articleIds: [
      "add-another-business",
      "switch-between-businesses",
      "join-business-by-invite",
    ],
  },
  {
    id: "getting-started",
    title: "Getting started",
    description: "First-time workspace setup and daily basics.",
    articleIds: [
      "setup-wizard",
      "inventory-master-data",
      "user-management-admin",
      "form-field-settings",
      "tax-and-currency",
      "demo-data-training",
    ],
  },
  {
    id: "branches",
    title: "Branches & locations",
    description: "Set up warehouses or branches and choose which one you are working in.",
    articleIds: ["add-branch", "switch-active-branch"],
  },
  {
    id: "selling",
    title: "Selling",
    description: "Quotations, sales orders, sales invoices, and group invoicing.",
    articleIds: [
      "quotation-to-sales-flow",
      "sales-order-release",
      "collective-invoicing",
    ],
  },
  {
    id: "buying",
    title: "Buying",
    description: "Purchase requests through supplier invoices.",
    articleIds: ["purchase-request-to-ap-flow", "goods-receipt-load-slip"],
  },
  {
    id: "inventory",
    title: "Stock & serials",
    description: "Move, receive, issue stock, and scan serial numbers.",
    articleIds: [
      "transfer-stock-between-branches",
      "receive-stock-at-branch",
      "issue-stock-from-branch",
      "serial-barcode-scanning",
      "serial-lot-registry",
    ],
  },
  {
    id: "pos",
    title: "Point of Sale",
    description: "Retail checkout, serial scanning, and shift management.",
    articleIds: ["pos-checkout-guide", "pos-manage-settings"],
  },
  {
    id: "finance",
    title: "Accounts & finance",
    description: "Receipts, vouchers, GL, and reporting.",
    articleIds: ["finance-accounts-overview"],
  },
  {
    id: "operations",
    title: "Operations & CRM",
    description: "CRM, after-sales, shipping, quality, support, and HR.",
    articleIds: [
      "crm-follow-ups",
      "after-sales-repair",
      "support-tickets",
      "wms-and-shipping",
      "quality-ncr-capa",
      "hr-payroll-basics",
      "fixed-assets-register",
      "customer-portal",
    ],
  },
  {
    id: "advanced",
    title: "Advanced modules",
    description: "WMS, Data Center, manufacturing, job costing, and approvals.",
    articleIds: [
      "wms-scheduled-receipts",
      "data-center-ingestion",
      "manufacturing-bom",
      "job-costing-projects",
      "approvals-queue",
      "activity-logs-audit",
    ],
  },
  {
    id: "insights",
    title: "Dashboard & reconciliation",
    description: "KPIs, reports, and fixing data gaps.",
    articleIds: ["reports-and-dashboard"],
  },
];
