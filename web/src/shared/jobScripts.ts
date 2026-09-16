/**
 * The two jobs the product exists to do, written down as ordered steps.
 *
 * Individual screens can each pass their own tests while the journey between
 * them is still incomprehensible. Naming the jobs makes the chain itself
 * testable: every step must be reachable, must say what it is, and must point
 * at the step after it.
 *
 * Quote to cash is how money comes in. Request to pay is how it goes out.
 * Nothing else in the app matters if either of these is unwalkable.
 */
export type JobStep = {
  id: string;
  /** What the user is trying to do, in their words rather than the schema's. */
  goal: string;
  route: string;
  /** Wording that must appear on screen, so the user knows they arrived. */
  screenSignal: RegExp;
  /** The step this one hands off to. Undefined only for the last step. */
  nextStepId?: string;
};

export type JobScript = {
  id: string;
  label: string;
  steps: JobStep[];
};

export const JOB_SCRIPTS: JobScript[] = [
  {
    id: "quote-to-cash",
    label: "Quote to cash",
    steps: [
      {
        id: "quote",
        goal: "Tell a customer what the work will cost",
        route: "/app/quotation/quotations",
        screenSignal: /quotation/i,
        nextStepId: "order",
      },
      {
        id: "order",
        goal: "Record what the customer agreed to buy",
        route: "/app/sales-order/sales-orders",
        screenSignal: /sales order/i,
        nextStepId: "invoice",
      },
      {
        id: "invoice",
        goal: "Bill the customer and release the stock",
        route: "/app/sales/sales",
        screenSignal: /sales/i,
        nextStepId: "collect",
      },
      {
        id: "collect",
        goal: "Collect the money",
        route: "/app/finance/receivables",
        screenSignal: /receivable/i,
      },
    ],
  },
  {
    id: "request-to-pay",
    label: "Request to pay",
    steps: [
      {
        id: "order",
        goal: "Order stock from a supplier",
        route: "/app/purchase-order/purchase-orders",
        screenSignal: /purchase order/i,
        nextStepId: "receive",
      },
      {
        id: "receive",
        goal: "Take the goods into stock and record what is owed",
        route: "/app/purchases/purchase-receive",
        screenSignal: /purchase/i,
        nextStepId: "pay",
      },
      {
        id: "pay",
        goal: "Pay the supplier",
        route: "/app/finance/payables",
        screenSignal: /payable/i,
      },
    ],
  },
];

/**
 * Wording that means something to whoever wrote the code and nothing to the
 * person using it. Any of these on a job screen is a defect, not a preference.
 */
export const JARGON_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /\bacct-i{1,3}\b/i, why: "internal module codename" },
  { pattern: /\b[a-z_]+_id\b/, why: "raw database column name" },
  { pattern: /\b(?:IN_PROGRESS|NOT_STARTED|PARTIALLY_[A-Z]+)\b/, why: "raw enum value" },
  { pattern: /\bnull\b/, why: "programming term for an empty value" },
  { pattern: /\bforeign key|constraint violation|sqlstate/i, why: "database error text" },
];

export function findJargon(text: string): { match: string; why: string }[] {
  const out: { match: string; why: string }[] = [];
  for (const { pattern, why } of JARGON_PATTERNS) {
    const hit = pattern.exec(text);
    if (hit) out.push({ match: hit[0], why });
  }
  return out;
}
