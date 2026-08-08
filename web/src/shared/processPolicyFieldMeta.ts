/** Shared labels for process-policy toggles (Setup hub + Form settings). */

export const PROCESS_POLICY_FIELD_META: Record<string, { label: string; help: string }> = {
  sales_require_quotation: {
    label: "Require quotation before sales order",
    help: "Off = staff can create a sales order without a quote first.",
  },
  sales_require_so: {
    label: "Require sales order before invoice",
    help: "Off = staff can create a sales invoice directly (counter / simple sales).",
  },
  sales_require_reservation: {
    label: "Require stock reservation on release",
    help: "On = pick list must reserve stock before delivery.",
  },
  sales_require_delivery_receipt: {
    label: "Require delivery receipt before invoice",
    help: "On = deliver before billing from a sales order.",
  },
  legacy_combined_so_release: {
    label: "Combined pick (reserve + deduct together)",
    help: "Legacy mode for tenants not using separate delivery receipts.",
  },
  sales_enforce_credit_limit: {
    label: "Block sales over customer credit limit",
    help: "On = cannot invoice if the customer is over their credit limit.",
  },
  sales_require_so_approval: {
    label: "Require approval on sales orders (advisory)",
    help: "Shown for process design. Fulfillment and invoicing currently proceed without blocking on SO approval.",
  },
  quotation_require_attachment: {
    label: "Require file on quotation",
    help: "Off by default. Turn on only if every quote must have an attached file.",
  },
  sales_order_require_attachment: {
    label: "Require file on sales order",
    help: "On = sales order needs an uploaded file before it can progress to In Progress.",
  },
  sales_require_attachment: {
    label: "Require file on sales invoice",
    help: "On = invoice needs an uploaded file before completion.",
  },
  purchase_require_pr: {
    label: "Require purchase request before PO",
    help: "Off = buyers can create a purchase order directly.",
  },
  purchase_require_pr_approval: {
    label: "Require approved purchase request (advisory)",
    help: "Shown for process design. POs may currently be created from Unconfirmed PRs.",
  },
  purchase_require_po_approval: {
    label: "Require approval on purchase orders (advisory)",
    help: "Shown for process design. Purchase Receive and Bills currently proceed without blocking on PO approval.",
  },
  purchase_require_gr_before_supplier_invoice: {
    label: "Require Purchase Receive before Bill (legacy)",
    help: "Off by default = Purchase Receive is primary — scan arrived serials and confirm to post stock + AP. On = legacy: Receive history first, then bill from that history.",
  },
  purchase_order_require_attachment: {
    label: "Require file on purchase order",
    help: "On = PO needs an uploaded file before Confirm.",
  },
  supplier_invoice_require_attachment: {
    label: "Require file on Bill",
    help: "On = Bill needs an uploaded file (e.g. delivery receipt or vendor SI) before Completed.",
  },
  accounts_auto_post_or: {
    label: "Auto-post official receipts to journal",
    help: "On = customer payments create journal entries automatically.",
  },
  accounts_auto_post_pv: {
    label: "Auto-post payment vouchers to journal",
    help: "On = supplier payments create journal entries automatically.",
  },
  accounts_auto_post_sales: {
    label: "Auto-post sales invoices to journal",
    help: "On = sales invoices post A/R journal entries when saved on the Invoice tab.",
  },
  accounts_auto_post_purchase: {
    label: "Auto-post purchase invoices to journal",
    help: "On = purchase invoices post A/P journal entries when saved on the Invoice tab.",
  },
  finance_require_je_approval: {
    label: "Require approval before posting journals",
    help: "On = journal entries must be approved before they post.",
  },
  inventory_gl_hybrid_enabled: {
    label: "Hybrid inventory GL (qty-tracked items)",
    help: "On = Purchase Receive/Sales of qty-tracked items post Inventory / GRNI / COGS. Map Inventory, GRNI, and COGS under Chart of Accounts defaults first. Existing tenants should set opening inventory before enabling.",
  },
};

/** Map form-settings entity types → module Setup hub. */
export const ENTITY_PROCESS_SETUP: Record<
  string,
  { scopeId: string; setupHref: string; title: string }
> = {
  quo_quotation: {
    scopeId: "quotation",
    setupHref: "/app/quotation/setup",
    title: "Quotation process rules",
  },
  so_sales_order: {
    scopeId: "sales_order",
    setupHref: "/app/sales-order/setup",
    title: "Sales order process rules",
  },
  sa_sales: {
    scopeId: "sales",
    setupHref: "/app/sales/setup",
    title: "Sales invoice process rules",
  },
  pr_purchase_request: {
    scopeId: "purchase_request",
    setupHref: "/app/purchase-request/setup",
    title: "Purchase request process rules",
  },
  po_purchase_order: {
    scopeId: "purchase_order",
    setupHref: "/app/purchase-order/setup",
    title: "Purchase order process rules",
  },
  fin_supplier_invoice: {
    scopeId: "purchases",
    setupHref: "/app/purchases/setup",
    title: "Purchase invoice process rules",
  },
};
