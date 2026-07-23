const ROUTE_TAG_RULES: Array<{ prefix: string; tags: string[] }> = [
  { prefix: "/app/selling", tags: ["selling", "reports"] },
  { prefix: "/app/quotation", tags: ["quotation", "selling"] },
  { prefix: "/app/sales-order", tags: ["sales-order", "selling"] },
  { prefix: "/app/sales", tags: ["sales", "selling", "return"] },
  { prefix: "/app/purchase-request", tags: ["purchase-request", "buying"] },
  { prefix: "/app/purchase-order", tags: ["purchase-order", "buying", "rfq"] },
  { prefix: "/app/purchase-order/goods-receipt", tags: ["goods-receipt", "buying", "inventory", "receive"] },
  { prefix: "/app/purchases", tags: ["supplier-invoice", "buying", "finance"] },
  { prefix: "/app/buying", tags: ["buying", "reports"] },
  { prefix: "/app/inventory/serial-lot", tags: ["serial-lot", "serial", "inventory"] },
  { prefix: "/app/inventory", tags: ["inventory"] },
  { prefix: "/app/after-sales", tags: ["after-sales", "repair", "warranty"] },
  { prefix: "/app/pos/manage", tags: ["pos", "pos-manage", "settings", "catalog"] },
  { prefix: "/app/pos", tags: ["pos", "selling", "checkout", "shift"] },
  { prefix: "/app/finance/acct-i/chart-of-accounts", tags: ["finance", "coa", "chart"] },
  { prefix: "/app/finance/acct-i", tags: ["finance", "journal", "bank"] },
  { prefix: "/app/finance", tags: ["finance"] },
  { prefix: "/app/operations/calendar", tags: ["operations", "calendar", "today"] },
  { prefix: "/app/operations/packs", tags: ["operations", "pack"] },
  { prefix: "/app/operations", tags: ["operations", "calendar", "packs"] },
  { prefix: "/app/comms", tags: ["communications", "gmail", "email"] },
  { prefix: "/app/crm", tags: ["crm"] },
  { prefix: "/app/onboarding", tags: ["onboarding", "setup"] },
  { prefix: "/app/setup", tags: ["setup", "onboarding"] },
  { prefix: "/app/user-management", tags: ["admin", "permissions", "policies"] },
  { prefix: "/app/manufacturing", tags: ["manufacturing", "bom"] },
  { prefix: "/app/quality", tags: ["quality", "ncr", "capa"] },
  { prefix: "/app/support", tags: ["support"] },
];

export function routeTagsFromPath(pathname: string): string[] {
  const tags = new Set<string>();
  // Longer prefixes first so more specific rules win alongside general ones.
  const sorted = [...ROUTE_TAG_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const rule of sorted) {
    // Boundary-safe: "/app/finance/acct-i" must not match "/app/finance/acct-ii/..."
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      for (const t of rule.tags) tags.add(t);
    }
  }
  return [...tags];
}

export function suggestedPrompts(pathname: string): string[] {
  if (pathname.includes("/operations/calendar")) {
    return [
      "How does Today and day view work?",
      "How do I create a timed calendar task?",
      "How do I link a work item to a quotation?",
    ];
  }
  if (pathname.includes("/operations/packs")) {
    return ["How do I edit an operations pack?", "What are system packs?", "How do I apply a pack?"];
  }
  if (pathname.includes("/operations")) {
    return [
      "How does Operations Hub work?",
      "How do I use the calendar Today button?",
      "How do I link a work item to an ERP document?",
    ];
  }
  if (
    pathname.includes("/chart-of-accounts") ||
    pathname === "/app/finance/acct-i" ||
    pathname.startsWith("/app/finance/acct-i/")
  ) {
    return [
      "How do I import the PH chart of accounts?",
      "How do I soft-delete a GL account?",
      "Why won't my journal entry post?",
    ];
  }
  if (pathname.includes("/finance")) {
    return [
      "How do official receipts work?",
      "How do I pay a supplier invoice?",
      "Where is chart of accounts?",
    ];
  }
  if (pathname.includes("/selling")) {
    return ["What KPIs are on the selling workspace?", "Where is Sales Status?", "Where is receivable status?"];
  }
  if (pathname.includes("/quotation")) {
    return [
      "Generate quotation for @",
      "How do I create a quotation?",
      "Send email quotation",
    ];
  }
  if (pathname.includes("/serial-lot")) {
    return [
      "How do serial numbers work?",
      "Serial count does not match quantity",
      "How do I receive serials on GR?",
    ];
  }
  if (pathname.includes("/goods-receipt")) {
    return [
      "How do I post a goods receipt?",
      "How do I receive serials on GR?",
      "What is pre-invoicing?",
    ];
  }
  if (pathname.includes("/sales") && !pathname.includes("/sales-order")) {
    return [
      "How do sales returns work with serials?",
      "How do I resume a held invoice?",
      "How do official receipts work?",
    ];
  }
  if (pathname.includes("/purchase-order")) {
    return [
      "How does RFQ work?",
      "How do I confirm a purchase order?",
      "Purchase request stuck in approval",
    ];
  }
  if (pathname.includes("/sales-order")) {
    return [
      "How do I release stock from a sales order?",
      "Delivery receipt vs shipping order?",
      "How do delivery receipts work?",
    ];
  }
  if (pathname.includes("/pos/manage") || pathname.includes("/pos/setup")) {
    return [
      "How do I set up POS products and categories?",
      "How do I configure POS tax and tenders?",
      "Where do I turn on POS auto-post to accounting?",
    ];
  }
  if (pathname.includes("/pos")) {
    return [
      "How do I open a POS shift?",
      "How does POS checkout work?",
      "How do I close a POS shift?",
      "POS serial scan at checkout",
    ];
  }
  if (pathname.includes("/comms") || pathname.includes("/communications")) {
    return ["How do I email a document?", "How do I connect Gmail?", "Where is the sent documents log?"];
  }
  if (pathname.includes("/purchases")) {
    return [
      "How do I create a supplier invoice from a goods receipt?",
      "How do I pay a supplier invoice?",
      "What is purchase pre-invoicing?",
    ];
  }
  if (pathname.includes("/onboarding") || pathname.includes("/setup")) {
    return [
      "What is the onboarding playbook?",
      "Transactions blocked until foundation setup",
      "How do I add another business?",
    ];
  }
  if (pathname.includes("/user-management")) {
    return [
      "Menu or screen is missing",
      "Process policy gates explained",
      "Demo data golden scenarios",
    ];
  }
  return [
    "How much is my expenses as of today?",
    "Recommend items for laptop",
    "Create sales order for @",
    "Show my notifications",
  ];
}
