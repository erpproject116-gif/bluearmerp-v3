/**
 * Plain-language, start-to-finish workflow guides shown at the top of the
 * pages that belong to each business flow. Written for non-technical users:
 * every step says what you do, in what order, and where to click next.
 */

import type { MeData } from "./auth-context";
import { isTenantFeatureEnabled, isTenantModuleEnabled } from "./moduleAccess";

export type WorkflowStep = {
  id: string;
  /** Short label for the step chip, e.g. "Quotation". */
  short: string;
  /** Full step title, e.g. "Give the customer a price (Quotation)". */
  title: string;
  /** 1–2 plain sentences: what you do here and what happens after. */
  what: string;
  /** Page to open for this step. */
  href: string;
  /** Route prefixes that mean "the user is currently on this step". */
  routePrefixes?: string[];
  /** Step can be skipped in the flow — shown with an "Optional" badge. */
  optional?: boolean;
  /** Hide step when this tenant module is disabled. */
  moduleCode?: string;
  /** Hide step when this tenant feature is disabled. */
  featureCode?: string;
  featureParentModuleId?: string;
};

export type WorkflowGuide = {
  id: string;
  /** e.g. "Selling — from quote to getting paid". */
  title: string;
  /** One plain sentence describing the whole journey. */
  summary: string;
  /** Full written guide in Help & guides. */
  docHref?: string;
  steps: WorkflowStep[];
};

export const workflowGuides: WorkflowGuide[] = [
  {
    id: "selling",
    title: "Selling — from quote to getting paid",
    summary:
      "Give the customer a price, confirm their order, deliver the items, bill them, then record their payment. You can start at any step, but this is the full journey.",
    docHref: "/app/documentation/kb/quotation-to-sales-flow",
    steps: [
      {
        id: "quotation",
        short: "Quotation",
        title: "Give the customer a price (Quotation)",
        what: "Create a quotation listing the items and prices, then print or email it to the customer. Nothing leaves your stock yet — it is just an offer.",
        href: "/app/quotation/quotations",
        routePrefixes: ["/app/quotation"],
        moduleCode: "quotation",
      },
      {
        id: "sales-order",
        short: "Sales Order",
        title: "Confirm the order (Sales Order)",
        what: "When the customer says yes, turn the quotation into a sales order. Inside New Sales Order, click Load Slip → Quotation so the lines copy over — no retyping.",
        href: "/app/sales-order/sales-orders",
        routePrefixes: ["/app/sales-order"],
        moduleCode: "sales_order",
      },
      {
        id: "deliver",
        short: "Deliver",
        title: "Deliver the items (Pick list & Delivery notes)",
        what: "Release the stock from the Pick list and record the delivery. If an item tracks serial numbers, scan each unit here so your records match what left the store.",
        href: "/app/sales-order/sales-orders/release",
        routePrefixes: [
          "/app/sales-order/sales-orders/release",
          "/app/sales-order/delivery-receipts",
          "/app/sales-order/shipping",
        ],
        moduleCode: "sales_order",
      },
      {
        id: "invoice",
        short: "Sales Invoice",
        title: "Bill the customer (Sales Invoice)",
        what: "Create the sales invoice — inside New Sales, click Load Slip → Sales Order to pull in what was delivered. This is the official record of the sale and what the customer owes.",
        href: "/app/sales/sales",
        routePrefixes: ["/app/sales", "/app/selling"],
        moduleCode: "sales",
      },
      {
        id: "payment",
        short: "Payment",
        title: "Record the payment (Receipts)",
        what: "When the customer pays, record it under Accounts → Receipts and apply it to their invoice. The invoice then shows as paid and your receivables stay accurate.",
        href: "/app/finance/official-receipts",
        routePrefixes: ["/app/finance/official-receipts"],
        moduleCode: "finance",
      },
    ],
  },
  {
    id: "buying",
    title: "Buying — from request to paying your supplier",
    summary:
      "Ask to buy, order from the supplier, receive the items into stock, record the supplier's bill, then pay it. You can start at the Purchase Order if you skip internal requests.",
    docHref: "/app/documentation/kb/purchase-request-to-ap-flow",
    steps: [
      {
        id: "request",
        short: "Request",
        title: "Ask to buy (Purchase Request)",
        what: "List what you need to buy and why. This step is optional — if your team does not use internal requests, start straight at the Purchase Order.",
        href: "/app/purchase-request/purchase-requests",
        routePrefixes: ["/app/purchase-request"],
        optional: true,
        moduleCode: "purchase_request",
      },
      {
        id: "order",
        short: "Purchase Order",
        title: "Order from the supplier (Purchase Order)",
        what: "Create a purchase order for your supplier. Use Load Slip to copy lines from a purchase request, or use RFQ first to compare prices from several suppliers.",
        href: "/app/purchase-order/purchase-orders",
        routePrefixes: ["/app/purchase-order", "/app/buying"],
        moduleCode: "purchase_order",
      },
      {
        id: "receive",
        short: "Receive",
        title: "Receive the items (Receiving)",
        what: "When the delivery arrives, create a goods receipt from the purchase order and scan serial numbers if the items are tracked. Posting the receipt puts the items into your stock.",
        href: "/app/purchase-order/goods-receipt",
        routePrefixes: ["/app/purchase-order/goods-receipt"],
        moduleCode: "purchase_order",
      },
      {
        id: "bill",
        short: "Purchase Invoice",
        title: "Record the supplier's bill (Purchase)",
        what: "Create the purchase (supplier invoice) — inside New Purchase, click Load Slip → Goods Receipt to pull in the received lines. This records exactly what you owe the supplier.",
        href: "/app/purchases/purchases",
        routePrefixes: ["/app/purchases"],
        moduleCode: "purchases",
      },
      {
        id: "pay",
        short: "Pay",
        title: "Pay the supplier (Vouchers)",
        what: "Record your payment under Accounts → Vouchers and apply it to the supplier's bill. The bill then shows as paid and your payables stay accurate.",
        href: "/app/finance/payment-vouchers",
        routePrefixes: ["/app/finance/payment-vouchers"],
        moduleCode: "finance",
        featureCode: "finance.payment_vouchers",
        featureParentModuleId: "finance",
      },
    ],
  },
  {
    id: "serial-lot",
    title: "Serial & lot tracking — from setup to reports",
    summary:
      "Turn on tracking per item, scan units in when you receive them, scan them out when you sell, then check the registry any time you need history.",
    docHref: "/app/documentation/kb/serial-barcode-scanning",
    steps: [
      {
        id: "enable",
        short: "Item setup",
        title: "Turn on tracking for the item (Items)",
        what: "Open the item and enable Track serial (or Track lot). Only tracked items ask for serial or lot numbers on documents — untracked items show a dash instead.",
        href: "/app/inventory/items",
        moduleCode: "inventory",
      },
      {
        id: "receive",
        short: "Scan in",
        title: "Scan units in when receiving (Goods Receipt)",
        what: "On the goods receipt, scan each unit's serial number (or enter lot numbers and quantities). Posting the receipt registers every unit in your stock.",
        href: "/app/purchase-order/goods-receipt",
        moduleCode: "purchase_order",
      },
      {
        id: "sell",
        short: "Scan out",
        title: "Scan units out when selling (Sales)",
        what: "On the sales document, scan the serial number of the exact unit that leaves the store. You can also scan a serial into the scan bar to add the item line automatically.",
        href: "/app/sales/sales",
        moduleCode: "sales",
      },
      {
        id: "registry",
        short: "Registry",
        title: "Check any unit's history (Serial & Lot registry)",
        what: "The registry shows where every unit is and everything that happened to it — received, sold, returned, or adjusted. Use the reports here to reconcile counts.",
        href: "/app/inventory/serial-lot/registry",
        routePrefixes: ["/app/inventory/serial-lot"],
        moduleCode: "inventory",
        featureCode: "inventory.serial_lot",
        featureParentModuleId: "inventory",
      },
    ],
  },
  {
    id: "pos",
    title: "POS — set up the register, then sell",
    summary:
      "Administrators configure products and tax under Manage. Cashiers open a shift on Terminal, check out walk-in sales, then close the shift with counted cash.",
    docHref: "/app/documentation/kb/pos-checkout-guide",
    steps: [
      {
        id: "manage",
        short: "Manage",
        title: "Set up catalog and register (POS Manage)",
        what: "Choose which products appear on the grid, set categories, default location, tax, tenders, and optional auto-post to accounting. Cashiers do not need this page.",
        href: "/app/pos/manage",
        routePrefixes: ["/app/pos/manage", "/app/pos/setup"],
        moduleCode: "pos",
      },
      {
        id: "terminal",
        short: "Terminal",
        title: "Sell at the counter (POS Terminal)",
        what: "Open a shift, scan or tap items into the cart, take payment, hold bills if a customer steps away, then close the shift. Checkout creates a sales invoice and reduces stock.",
        href: "/app/pos",
        routePrefixes: ["/app/pos"],
        moduleCode: "pos",
      },
    ],
  },
];

export type ResolvedWorkflow = {
  guide: WorkflowGuide;
  stepIndex: number;
  /** Steps after filtering disabled modules/features (same as guide.steps when unfiltered). */
  visibleSteps: WorkflowStep[];
};

export function filterWorkflowSteps(steps: WorkflowStep[], me: MeData | null | undefined): WorkflowStep[] {
  return steps.filter((step) => {
    if (step.moduleCode && !isTenantModuleEnabled(me, step.moduleCode)) return false;
    if (
      step.featureCode &&
      step.featureParentModuleId &&
      !isTenantFeatureEnabled(me, step.featureCode, step.featureParentModuleId)
    ) {
      return false;
    }
    return true;
  });
}

/** Find the workflow and step that matches the current page, if any. */
export function resolveWorkflowForPath(
  pathname: string,
  me?: MeData | null,
): ResolvedWorkflow | null {
  let best: { guide: WorkflowGuide; stepIndex: number; prefixLen: number; visibleSteps: WorkflowStep[] } | null =
    null;
  for (const guide of workflowGuides) {
    const visibleSteps = filterWorkflowSteps(guide.steps, me);
    if (visibleSteps.length === 0) continue;
    for (let i = 0; i < visibleSteps.length; i++) {
      for (const prefix of visibleSteps[i].routePrefixes ?? []) {
        // Boundary-safe: "/app/sales" must not match "/app/sales-order/...".
        if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
          if (!best || prefix.length > best.prefixLen) {
            best = { guide, stepIndex: i, prefixLen: prefix.length, visibleSteps };
          }
        }
      }
    }
  }
  return best
    ? { guide: { ...best.guide, steps: best.visibleSteps }, stepIndex: best.stepIndex, visibleSteps: best.visibleSteps }
    : null;
}
