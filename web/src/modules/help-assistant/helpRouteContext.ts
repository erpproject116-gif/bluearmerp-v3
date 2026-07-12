const ROUTE_TAG_RULES: Array<{ prefix: string; tags: string[] }> = [
  { prefix: "/app/selling", tags: ["selling", "reports"] },
  { prefix: "/app/quotation", tags: ["quotation", "selling"] },
  { prefix: "/app/sales-order", tags: ["sales-order", "selling"] },
  { prefix: "/app/sales", tags: ["sales", "selling", "return"] },
  { prefix: "/app/purchase-request", tags: ["purchase-request", "buying"] },
  { prefix: "/app/purchase-order", tags: ["purchase-order", "buying", "rfq"] },
  { prefix: "/app/goods-receipt", tags: ["goods-receipt", "buying", "inventory", "receive"] },
  { prefix: "/app/inventory/serial-lot", tags: ["serial-lot", "serial", "inventory"] },
  { prefix: "/app/inventory", tags: ["inventory"] },
  { prefix: "/app/after-sales", tags: ["after-sales", "repair", "warranty"] },
  { prefix: "/app/pos", tags: ["pos", "selling"] },
  { prefix: "/app/finance", tags: ["finance"] },
  { prefix: "/app/crm", tags: ["crm"] },
  { prefix: "/app/onboarding", tags: ["onboarding", "setup"] },
  { prefix: "/app/setup", tags: ["setup", "onboarding"] },
];

export function routeTagsFromPath(pathname: string): string[] {
  const tags = new Set<string>();
  for (const rule of ROUTE_TAG_RULES) {
    if (pathname.startsWith(rule.prefix)) {
      for (const t of rule.tags) tags.add(t);
    }
  }
  return [...tags];
}

export function suggestedPrompts(pathname: string): string[] {
  if (pathname.includes("/selling")) {
    return ["What KPIs are on the selling workspace?", "Where is Sales Status?", "Where is receivable status?"];
  }
  if (pathname.includes("/quotation")) {
    return ["How do I create a quotation?", "How do I convert a quote to a sales order?", "Where is tax setup?"];
  }
  if (pathname.includes("/serial-lot")) {
    return ["How do serial numbers work?", "How do I receive serials on GR?", "How do I trace a serial?"];
  }
  if (pathname.includes("/goods-receipt")) {
    return ["How do I post a goods receipt?", "How do I receive serials on GR?", "What is pre-invoicing?"];
  }
  if (pathname.includes("/sales") && !pathname.includes("/sales-order")) {
    return ["How do sales returns work?", "How do I create an invoice?", "How do official receipts work?"];
  }
  if (pathname.includes("/purchase-order")) {
    return ["How does RFQ work?", "How do I create a purchase order?", "How do I load from RFQ?"];
  }
  if (pathname.includes("/sales-order")) {
    return ["How do I release stock from a sales order?", "How do delivery receipts work?"];
  }
  if (pathname.includes("/pos")) {
    return ["How do I open a POS shift?", "How does POS checkout work?"];
  }
  if (pathname.includes("/onboarding") || pathname.includes("/setup")) {
    return ["What is the onboarding playbook?", "How do I add another business?"];
  }
  return [
    "How do I switch between businesses?",
    "Where is the onboarding playbook?",
    "How do document attachments work?",
  ];
}
