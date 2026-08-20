import type { SetupReadiness } from "./usePlatform";

export type GettingStartedStep = {
  id: string;
  label: string;
  blurb: string;
  href: string;
  done: boolean;
  required: boolean;
};

/** Shared copy for Home Getting started, setup wizard, and onboarding panel. */
export const GETTING_STARTED_COPY: Record<string, { label: string; blurb: string; href: string }> = {
  company: {
    label: "Company name & logo",
    blurb: "Shows on invoices, receipts, and reports.",
    href: "/app/settings/branding",
  },
  chart_of_accounts: {
    label: "Chart of accounts",
    blurb: "Accounts used when sales and purchases post.",
    href: "/app/finance/acct-i/chart-of-accounts",
  },
  currency_tax: {
    label: "Currency & tax",
    blurb: "PHP and VAT types for quotations and invoices.",
    href: "/app/quotation/tax-mngt/tax-types",
  },
  process_policies: {
    label: "Process policies",
    blurb: "Which documents are required before the next step.",
    href: "/app/user-management/process-policies",
  },
  location: {
    label: "Stock location",
    blurb: "Warehouse or branch before you move inventory.",
    href: "/app/inventory/locations",
  },
  partners: {
    label: "First customer or vendor",
    blurb: "Someone you sell to or buy from.",
    href: "/app/inventory/partners",
  },
  items: {
    label: "First product",
    blurb: "What you sell or stock.",
    href: "/app/inventory/items",
  },
  team: {
    label: "Invite your team",
    blurb: "Optional — you can finish this later.",
    href: "/app/user-management/users",
  },
  first_sale: {
    label: "First invoice",
    blurb: "Create a sales invoice for a customer.",
    href: "/app/sales/sales/new",
  },
  bank: {
    label: "Bank or cash account",
    blurb: "Where customer payments and vendor payouts go.",
    href: "/app/finance/banking",
  },
};

const HOME_ORDER = [
  "company",
  "chart_of_accounts",
  "currency_tax",
  "process_policies",
  "location",
  "partners",
  "items",
  "team",
  "first_sale",
  "bank",
];

const KEEP_VISIBLE_UNTIL = new Set(["company", "chart_of_accounts", "currency_tax", "process_policies", "location", "partners", "items", "first_sale", "bank"]);

export function resolveGettingStarted(setup: SetupReadiness | null | undefined): {
  steps: GettingStartedStep[];
  percent: number;
  next: GettingStartedStep | undefined;
  visible: boolean;
} {
  const byId = new Map((setup?.steps ?? []).map((s) => [s.id, s]));
  const steps: GettingStartedStep[] = HOME_ORDER.map((id) => {
    const copy = GETTING_STARTED_COPY[id]!;
    const src = byId.get(id);
    return {
      id,
      label: copy.label,
      blurb: copy.blurb,
      href: copy.href,
      done: src?.done ?? false,
      required: src?.required ?? id !== "team",
    };
  });
  const tracked = steps.filter((s) => KEEP_VISIBLE_UNTIL.has(s.id) && s.id !== "team");
  const doneCount = tracked.filter((s) => s.done).length;
  const percent = tracked.length > 0 ? Math.round((doneCount * 100) / tracked.length) : 0;
  const next = steps.find((s) => !s.done && s.id !== "team");
  const visible = tracked.some((s) => !s.done);
  return { steps, percent, next, visible };
}

export const WIZARD_STEP_IDS = new Set([
  "company",
  "chart_of_accounts",
  "currency_tax",
  "process_policies",
  "location",
  "partners",
  "items",
  "team",
  "ready",
]);

/** Foundation wizard steps only — first invoice / bank stay on Home. */
export function wizardFoundationSteps(setup: SetupReadiness | null | undefined) {
  return (setup?.steps ?? []).filter((s) => WIZARD_STEP_IDS.has(s.id) && s.id !== "ready");
}

export function wizardFoundationPercent(setup: SetupReadiness | null | undefined): number {
  const steps = wizardFoundationSteps(setup);
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.done).length;
  return Math.round((done * 100) / steps.length);
}
