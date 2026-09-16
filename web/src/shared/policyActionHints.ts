/**
 * Maps process-policy / gate validation field keys to a next-step CTA.
 * Used by handleSaveResult so non-tech users get a button, not only an error code.
 * Labels use action verbs (What to do next).
 */

export type PolicyActionHint = {
  href: string;
  label: string;
};

const FIELD_HINTS: Record<string, PolicyActionHint> = {
  // Do not map bare "lines" — many docs use that key for line-item errors that are not SO-related.
  partner_id: { href: "/app/inventory/partners", label: "Open Customers / Vendors" },
  customer_id: { href: "/app/inventory/partners", label: "Open Customers" },
  vendor_id: { href: "/app/inventory/partners", label: "Open Vendors" },
  source_quotation_id: { href: "/app/quotation/quotations", label: "Open Quotations" },
  source_quotation_line_id: { href: "/app/sales-order/sales-orders", label: "Load Slip from Quotation" },
  "lines[0].source_quotation_line_id": { href: "/app/sales-order/sales-orders", label: "Load Slip from Quotation" },
  purchase_request_id: { href: "/app/purchase-request/purchase-requests", label: "Open Purchase Requests" },
  goods_receipt_line_id: { href: "/app/purchases/purchase-receive", label: "Open Purchase Receive" },
  sales_order_id: { href: "/app/dashboard/approvals", label: "Open Approvals" },
  purchase_order_id: { href: "/app/dashboard/approvals", label: "Open Approvals" },
  attachments: { href: "/app/sales-order/setup", label: "Adjust attachment settings" },
  purchase_order_line_id: { href: "/app/purchase-order/purchase-orders", label: "Confirm Purchase Order" },
  source_sales_order_id: { href: "/app/sales-order/sales-orders", label: "Pick items on Sales Order" },
  source_sales_order_line_id: { href: "/app/sales-order/sales-orders", label: "Pick items on Sales Order" },
  progress_status: { href: "/app/sales-order/sales-orders", label: "Complete the Sales Order" },
  conversion: { href: "/app/sales-order/sales-orders", label: "Load Slip from Quotation" },
};

const MESSAGE_HINTS: Array<{ match: RegExp; hint: PolicyActionHint }> = [
  {
    match: /customer is required|pick a customer|select a customer/i,
    hint: { href: "/app/inventory/partners", label: "Open Customers" },
  },
  {
    match: /vendor is required|supplier is required|pick a vendor/i,
    hint: { href: "/app/inventory/partners", label: "Open Vendors" },
  },
  {
    match: /attachment is required|file attachment is required/i,
    hint: { href: "/app/user-management/process-policies", label: "Review attachment settings" },
  },
  {
    match: /not found or not confirmed|confirm the purchase order|must be confirmed first/i,
    hint: { href: "/app/purchase-order/purchase-orders", label: "Confirm Purchase Order" },
  },
  {
    match: /higher than what was received|quantity exceeds gr balance|goods receipt|purchase receive/i,
      hint: { href: "/app/purchases/purchase-receive", label: "Open Purchase Receive" },
  },
  {
    match: /not ready to invoice|isn.?t ready to invoice|progress.*completed|set its progress to completed/i,
    hint: { href: "/app/sales-order/sales-orders", label: "Complete the Sales Order" },
  },
  {
    match: /pick list|ready to invoice|nothing left to invoice|what's left to invoice|left to invoice/i,
    hint: { href: "/app/sales-order/sales-orders", label: "Pick items on Sales Order" },
  },
  { match: /sales order/i, hint: { href: "/app/sales-order/sales-orders", label: "Open Sales Orders" } },
  { match: /quotation/i, hint: { href: "/app/quotation/quotations", label: "Open Quotations" } },
  { match: /purchase request/i, hint: { href: "/app/purchase-request/purchase-requests", label: "Open Purchase Requests" } },
  { match: /rfq/i, hint: { href: "/app/purchase-order/rfq", label: "Open RFQs" } },
  { match: /insufficient.*stock|not enough stock/i, hint: { href: "/app/inventory/find-stock", label: "Open Inv Per Branch" } },
  { match: /serial/i, hint: { href: "/app/inventory/serial-lot/registry", label: "Open Serials" } },
  { match: /approv/i, hint: { href: "/app/dashboard/approvals", label: "Open Approvals" } },
  { match: /process polic/i, hint: { href: "/app/user-management/process-policies", label: "Review process policies" } },
];

export function resolvePolicyActionHint(errors?: Record<string, string> | null): PolicyActionHint | null {
  if (!errors) return null;
  for (const key of Object.keys(errors)) {
    if (FIELD_HINTS[key]) return FIELD_HINTS[key];
    if (/source_quotation_line_id/i.test(key)) return FIELD_HINTS.source_quotation_line_id;
  }
  for (const msg of Object.values(errors)) {
    if (!msg) continue;
    // Prefer Load Slip recovery over generic "Open Quotations" for line-link failures.
    if (/quotation line/i.test(msg)) return FIELD_HINTS.source_quotation_line_id;
    for (const row of MESSAGE_HINTS) {
      if (row.match.test(msg)) return row.hint;
    }
  }
  return null;
}
