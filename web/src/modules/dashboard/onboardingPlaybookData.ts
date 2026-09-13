import { GETTING_STARTED_COPY, resolveGettingStarted } from "../../shared/setupProgress";
import type { OnboardingTrack } from "../../shared/usePlatform";
import type { SetupReadiness } from "../../shared/usePlatform";

/** One playbook row: sentence + CTA, progress from setup-readiness or onboarding tracks. */
export type PlaybookStepDef = {
  trackId: string;
  stepId: string;
  sentence: string;
  cta: string;
  /** Override track/setup href when the CTA should land elsewhere. */
  href?: string;
};

export type PlaybookWeekDef = {
  title: string;
  summary: string;
  steps: PlaybookStepDef[];
};

export const ONBOARDING_PLAYBOOK_WEEKS: PlaybookWeekDef[] = [
  {
    title: "Week 1 — Foundation & admin",
    summary: "Company, products, policies, and team access before day-to-day documents.",
    steps: [
      { trackId: "foundation", stepId: "company", sentence: "Add your company name and logo so they print on slips and reports.", cta: "Open branding" },
      { trackId: "foundation", stepId: "chart_of_accounts", sentence: "Review the chart of accounts and default GL mappings for sales and purchases.", cta: "Review accounts" },
      { trackId: "foundation", stepId: "currency_tax", sentence: "Confirm PHP currency and VAT types used on quotes and invoices.", cta: "Review tax types" },
      { trackId: "foundation", stepId: "process_policies", sentence: "Set which documents must exist before the next step (quote before SO, GR before invoice, attachments).", cta: "Process policies" },
      { trackId: "foundation", stepId: "location", sentence: "Confirm your default stock location or branch before moving inventory.", cta: "Stock locations" },
      { trackId: "foundation", stepId: "partners", sentence: "Add at least one customer or supplier you will quote or buy from.", cta: "Add partner" },
      { trackId: "foundation", stepId: "items", sentence: "Create your first product — what you sell, stock, or manufacture.", cta: "Add product" },
      { trackId: "foundation", stepId: "team", sentence: "Invite colleagues when you are ready; you can skip and return later.", cta: "Manage users" },
      { trackId: "admin", stepId: "tenant_modules", sentence: "Turn on optional modules such as POS, WMS, or Data Center for your business.", cta: "Modules & features" },
      { trackId: "admin", stepId: "mapping_center", sentence: "Review Mapping Center if you use Generate Other Slips between documents.", cta: "Mapping Center" },
      { trackId: "admin", stepId: "cutover_import", sentence: "Import opening balances only if you are migrating — skip if you enter data fresh in Bluearm.", cta: "Migration Center" },
      { trackId: "admin", stepId: "invite_team", sentence: "Send invites so teammates sign in with their own Google email.", cta: "Invite team" },
    ],
  },
  {
    title: "Week 2 — Selling & stock",
    summary: "Quote → sales order → pick → invoice → customer payment, plus serials and dashboard checks.",
    steps: [
      { trackId: "selling", stepId: "quotation", sentence: "Send a formal price offer before you confirm an order.", cta: "New quotation" },
      { trackId: "selling", stepId: "sales_order", sentence: "Confirm the sale as a sales order — use Load Slip from the quote when ready.", cta: "New sales order" },
      { trackId: "selling", stepId: "so_release", sentence: "Release or pick stock so fulfillment matches what you will invoice.", cta: "Pick / release" },
      { trackId: "selling", stepId: "sales_invoice", sentence: "Bill the customer with a sales invoice — Load Slip pulls open order lines.", cta: "New sales invoice" },
      { trackId: "selling", stepId: "official_receipt", sentence: "Record customer payment against open invoices.", cta: "Official receipt" },
      { trackId: "serials", stepId: "serial_item", sentence: "Turn on Track serial for items you scan one unit at a time.", cta: "Products" },
      { trackId: "serials", stepId: "serial_receive", sentence: "Scan serials when goods arrive on a posted goods receipt.", cta: "Goods receipt" },
      { trackId: "serials", stepId: "serial_sale", sentence: "Match serial scans to quantity when you invoice or sell.", cta: "Sales invoice" },
      { trackId: "insights", stepId: "stock_reconciliation", sentence: "Run stock reconciliation to fix serial gaps and document mismatches.", cta: "Stock reconciliation" },
    ],
  },
  {
    title: "Week 3 — Production & recipe",
    summary: "Processing recipes and batch jobs from the Manufacturing hub — stock moves only when you post.",
    steps: [
      {
        trackId: "manufacturing",
        stepId: "mfg_hub",
        sentence: "Open Manufacturing to pick Assembly, Cutting, or Recipe / Processing — drafts do not move stock.",
        cta: "Manufacturing hub",
        href: "/app/production",
      },
      {
        trackId: "manufacturing",
        stepId: "recipe_bom",
        sentence: "Create a processing recipe with batch size, ingredients, and yield bands before you run a batch.",
        cta: "Processing recipes",
        href: "/app/production/recipe/recipes",
      },
      {
        trackId: "manufacturing",
        stepId: "recipe_job",
        sentence: "Start Recipe / Processing — pick the recipe, batch qty, and warehouse; Save draft is OK without a stock move.",
        cta: "New processing order",
        href: "/app/production/orders/new?type=recipe",
      },
      {
        trackId: "manufacturing",
        stepId: "recipe_post",
        sentence: "When ingredients are green, finish with Process & Post so ingredients leave stock and finished goods arrive.",
        cta: "Recipe jobs",
        href: "/app/production/recipe/jobs",
      },
    ],
  },
  {
    title: "Week 4 — Buying & accounts",
    summary: "Purchase request through supplier payment and core finance reports.",
    steps: [
      { trackId: "buying", stepId: "purchase_request", sentence: "List what you need to buy before raising a purchase order.", cta: "Purchase request" },
      { trackId: "buying", stepId: "purchase_order", sentence: "Commit to the supplier with a PO — Load Slip from PR or RFQ when applicable.", cta: "New PO" },
      { trackId: "buying", stepId: "goods_receipt", sentence: "Post goods receipt to increase stock when shipment arrives.", cta: "Goods receipt" },
      { trackId: "buying", stepId: "supplier_invoice", sentence: "Record the supplier bill — Load Slip from GR or PO lines.", cta: "Supplier invoice" },
      { trackId: "buying", stepId: "payment_voucher", sentence: "Pay open supplier invoices with a payment voucher.", cta: "Payment voucher" },
      { trackId: "finance", stepId: "customer_vendor_book", sentence: "Review Customer/Vendor Book for slip-level AR or AP in a date range.", cta: "Customer/Vendor Book" },
      { trackId: "finance", stepId: "bank_recon", sentence: "Match bank statement lines to receipts and vouchers.", cta: "Bank reconciliation" },
    ],
  },
  {
    title: "Week 5 — POS & operations",
    summary: "Retail shifts, CRM follow-ups, and optional service workflows.",
    steps: [
      { trackId: "pos", stepId: "pos_manage", sentence: "Set POS location, tax, and barcode options before opening the terminal.", cta: "POS Manage" },
      { trackId: "pos", stepId: "pos_open_shift", sentence: "Open a shift with opening cash at the POS terminal.", cta: "Open POS" },
      { trackId: "pos", stepId: "pos_checkout", sentence: "Ring up a sale — checkout creates a sales invoice.", cta: "POS checkout" },
      { trackId: "pos", stepId: "pos_close_shift", sentence: "Close the shift and review cash at end of day.", cta: "Close shift" },
      { trackId: "operations", stepId: "follow_up_task", sentence: "Schedule a CRM follow-up for a customer you are nurturing.", cta: "Follow-up tasks" },
      { trackId: "operations_hub", stepId: "operations_workspace", sentence: "Open Work Hub for Kanban-style projects linked to ERP work.", cta: "Work Hub" },
      { trackId: "insights", stepId: "business_dashboard", sentence: "Scan Business Dashboard KPIs and red flags on the home tab.", cta: "Dashboard" },
    ],
  },
];

export type ResolvedPlaybookStep = PlaybookStepDef & { done: boolean; href: string };

function trackStep(tracks: OnboardingTrack[], trackId: string, stepId: string) {
  return tracks.find((t) => t.id === trackId)?.steps.find((s) => s.id === stepId);
}

function foundationHref(stepId: string): string {
  return GETTING_STARTED_COPY[stepId]?.href ?? "/app/setup";
}

function foundationDone(setup: SetupReadiness | null | undefined, stepId: string): boolean {
  const row = setup?.steps.find((s) => s.id === stepId);
  if (row) return row.done;
  return resolveGettingStarted(setup).steps.find((s) => s.id === stepId)?.done ?? false;
}

/** Map playbook row → href + done from setup-readiness or API tracks (no separate progress model). */
export function resolvePlaybookStep(
  def: PlaybookStepDef,
  tracks: OnboardingTrack[],
  setup: SetupReadiness | null | undefined,
): ResolvedPlaybookStep | null {
  if (def.trackId === "foundation") {
    const copy = GETTING_STARTED_COPY[def.stepId];
    if (!copy) return null;
    return {
      ...def,
      href: def.href ?? foundationHref(def.stepId),
      done: foundationDone(setup, def.stepId),
    };
  }
  const ts = trackStep(tracks, def.trackId, def.stepId);
  if (!ts) return null;
  return {
    ...def,
    href: def.href ?? ts.href,
    done: ts.done,
  };
}

export function resolvePlaybookWeek(
  week: PlaybookWeekDef,
  tracks: OnboardingTrack[],
  setup: SetupReadiness | null | undefined,
): ResolvedPlaybookStep[] {
  const out: ResolvedPlaybookStep[] = [];
  for (const def of week.steps) {
    const row = resolvePlaybookStep(def, tracks, setup);
    if (row) out.push(row);
  }
  return out;
}

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
