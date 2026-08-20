/** Week groupings for the onboarding playbook on Home → Onboarding. */
export const ONBOARDING_PLAYBOOK_WEEKS = [
  {
    title: "Week 1 — Foundation & admin",
    body: "Complete workspace setup, review process policies (including attachment rules), enable modules, and invite your team. Importing from another system is optional — skip Migration Center if you will enter data in Bluearm.",
    tracks: ["foundation", "admin"],
  },
  {
    title: "Week 2 — Selling & stock",
    body: "Quotation → sales order (Load Slip) → pick list → invoice (Load Slip) → customer payment. Check pre-invoicing and stock reconciliation.",
    tracks: ["selling", "serials", "insights"],
  },
  {
    title: "Week 3 — Buying & accounts",
    body: "PR → RFQ → PO → goods receipt → supplier invoice (Load Slip) → payment. Review purchase pre-invoicing and Customer/Vendor Book.",
    tracks: ["buying", "finance"],
  },
  {
    title: "Week 4 — POS & operations",
    body: "Configure POS Manage, open a shift, checkout (with serial scan if needed), and close the shift. Explore CRM, after-sales, and support.",
    tracks: ["pos", "operations"],
  },
] as const;

export const ONBOARDING_KB_QUICK_LINKS: { label: string; articleId: string }[] = [
  { label: "What is Load Slip?", articleId: "load-slip-overview" },
  { label: "Attachment before Confirm", articleId: "attachment-requirements" },
  { label: "Quote to cash", articleId: "quotation-to-sales-flow" },
  { label: "Buy to pay", articleId: "purchase-request-to-ap-flow" },
  { label: "RFQ and vendor quotes", articleId: "rfq-workflow" },
  { label: "Pre-invoicing (sales)", articleId: "sales-pre-invoicing-report" },
  { label: "Pre-invoicing (purchases)", articleId: "purchase-pre-invoicing-report" },
  { label: "Customer/Vendor Book", articleId: "customer-vendor-book-report" },
];
