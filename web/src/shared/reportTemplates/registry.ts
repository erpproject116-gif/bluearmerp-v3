import type { ReportTemplateKey } from "./types";

/** Registry for tenant report templates — add column defs per report when wiring UI. */
export const REPORT_TEMPLATE_REGISTRY: Record<
  ReportTemplateKey,
  { label: string; module: string; wired: boolean }
> = {
  sales_discount_status: { label: "Sales Discount Status", module: "sales", wired: true },
  sales_collective_invoice_status: { label: "Sales Invoice Status", module: "sales", wired: true },
  sales_status: { label: "Sales Status", module: "sales", wired: true },
  sales_order_status: { label: "Sales Order Status", module: "sales-order", wired: true },
  official_receipt_status: { label: "Official Receipt Status", module: "sales", wired: true },
};
