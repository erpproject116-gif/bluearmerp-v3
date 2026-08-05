/**
 * Maps process-policy / gate validation field keys to a next-step CTA.
 * Used by handleSaveResult so non-tech users get a button, not only an error code.
 */

export type PolicyActionHint = {
  href: string;
  label: string;
};

const FIELD_HINTS: Record<string, PolicyActionHint> = {
  lines: { href: "/app/sales-order/sales-orders", label: "Open Sales Orders" },
  source_quotation_id: { href: "/app/quotation/quotations", label: "Open Quotations" },
  purchase_request_id: { href: "/app/purchase-request/purchase-requests", label: "Open Purchase Requests" },
  goods_receipt_line_id: { href: "/app/purchase-order/goods-receipt", label: "Open Purchase Receive" },
  sales_order_id: { href: "/app/dashboard/approvals", label: "Open Approvals" },
  purchase_order_id: { href: "/app/dashboard/approvals", label: "Open Approvals" },
  attachments: { href: "/app/sales-order/setup", label: "Adjust attachment settings" },
  purchase_order_line_id: { href: "/app/purchase-order/purchase-orders", label: "Confirm Purchase Order" },
};

const MESSAGE_HINTS: Array<{ match: RegExp; hint: PolicyActionHint }> = [
  {
    match: /attachment is required/i,
    hint: { href: "/app/user-management/process-policies", label: "Turn off attachment requirement" },
  },
  {
    match: /not found or not confirmed/i,
    hint: { href: "/app/purchase-order/purchase-orders", label: "Confirm Purchase Order first" },
  },
  {
    match: /confirm the purchase order/i,
    hint: { href: "/app/purchase-order/purchase-orders", label: "Open Purchase Orders" },
  },
  { match: /goods receipt|purchase receive/i, hint: { href: "/app/purchase-order/goods-receipt", label: "Open Purchase Receive" } },
  { match: /sales order/i, hint: { href: "/app/sales-order/sales-orders", label: "Open Sales Orders" } },
  { match: /quotation/i, hint: { href: "/app/quotation/quotations", label: "Open Quotations" } },
  { match: /purchase request/i, hint: { href: "/app/purchase-request/purchase-requests", label: "Open Purchase Requests" } },
  { match: /approv/i, hint: { href: "/app/dashboard/approvals", label: "Open Approvals" } },
  { match: /process polic/i, hint: { href: "/app/user-management/process-policies", label: "Review process policies" } },
];

export function resolvePolicyActionHint(errors?: Record<string, string> | null): PolicyActionHint | null {
  if (!errors) return null;
  for (const key of Object.keys(errors)) {
    if (FIELD_HINTS[key]) return FIELD_HINTS[key];
  }
  for (const msg of Object.values(errors)) {
    if (!msg) continue;
    for (const row of MESSAGE_HINTS) {
      if (row.match.test(msg)) return row.hint;
    }
  }
  return null;
}
