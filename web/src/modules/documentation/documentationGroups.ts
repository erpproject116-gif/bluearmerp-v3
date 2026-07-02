import type { DocGroup } from "./documentationTypes";

/** Logical groupings for the help sidebar and home page. Order = display order. */
export const documentationGroups: DocGroup[] = [
  {
    id: "start",
    title: "Start here",
    description: "Layout, dashboard, and how to find your way around.",
    sectionIds: ["getting-started", "dashboard"],
  },
  {
    id: "stock",
    title: "Stock & production",
    description: "Items, partners, serial/lot, manufacturing, and quality.",
    sectionIds: ["inventory", "serial-lot", "manufacturing", "quality"],
  },
  {
    id: "sell",
    title: "Selling",
    description: "Quotes through invoicing, shipping, and commissions.",
    sectionIds: ["quotation", "tax-setup", "sales-order", "shipping", "sales", "collective-invoicing"],
  },
  {
    id: "buy",
    title: "Purchasing",
    description: "Requests, orders, receipts, and inbound logistics.",
    sectionIds: ["purchase-request", "data-ops"],
  },
  {
    id: "accounts",
    title: "Finance & reports",
    description: "Receivables, payables, Acct I/II, assets, and analytics.",
    sectionIds: ["finance", "reports", "bi", "fixed-assets", "job-costing"],
  },
  {
    id: "service",
    title: "CRM & service",
    description: "Follow-ups, support tickets, repairs, HR, and portal.",
    sectionIds: ["crm", "support", "after-sales", "hr", "portal"],
  },
  {
    id: "retail",
    title: "Retail",
    description: "Point-of-sale checkout and shifts.",
    sectionIds: ["pos"],
  },
  {
    id: "admin",
    title: "Administration",
    description: "Users, policies, approvals, mapping, and demo data.",
    sectionIds: ["admin", "process-policies", "approvals", "mapping-center", "demo-data"],
  },
  {
    id: "reference",
    title: "Reference",
    description: "What is planned next and where to learn more.",
    sectionIds: ["roadmap"],
  },
];
