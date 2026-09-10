import type { MfgMode } from "./mfgProductionMode";

export type ProductionFlowStep = {
  id: string;
  label: string;
  short: string;
  description: string;
  detail: string;
  href: string;
  routePrefixes: string[];
  optional?: boolean;
  /** Shown on the Jobs list as a row action, not a separate page */
  onJobsRow?: boolean;
};

export type ProductionFlow = {
  mode: MfgMode;
  title: string;
  tagline: string;
  steps: ProductionFlowStep[];
};

const ASSEMBLY_FLOW: ProductionFlow = {
  mode: "assembly",
  title: "Assembly",
  tagline: "Put parts together into a finished product.",
  steps: [
    {
      id: "sales_order",
      label: "Sales order",
      short: "Optional",
      description: "Optional — link a customer order if you are building to order.",
      detail:
        "Create or open a sales order, then use From customer order on Assembly → Jobs, or create the job and link later.",
      href: "/app/sales-order/sales-orders",
      routePrefixes: ["/app/sales-order"],
      optional: true,
    },
    {
      id: "recipe",
      label: "Recipe",
      short: "What you build",
      description: "Finished product and the parts you use.",
      detail:
        "Assembly → Recipes: name the recipe, pick the finished product, list parts and how many of each. Leave Advanced alone unless you need yield tweaks.",
      href: "/app/production/assembly/recipes",
      routePrefixes: ["/app/production/assembly/recipes"],
    },
    {
      id: "job",
      label: "Job",
      short: "How many",
      description: "Create a draft job from the recipe.",
      detail: "Assembly → Jobs → New job: pick recipe, how many to make, and location. Then Start job.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
    },
    {
      id: "release",
      label: "Start job",
      short: "Begin",
      description: "Start the job so you can take stock and finish.",
      detail: "On the Jobs list, click Start job on the draft row.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "issue",
      label: "Take materials",
      short: "If tracked",
      description: "Only needed when parts use serial or lot numbers.",
      detail:
        "If your parts are not serial/lot tracked, skip this step and Finish. Otherwise open Take materials on the job row.",
      href: "/app/production/issue-station",
      routePrefixes: ["/app/production/issue-station"],
      optional: true,
    },
    {
      id: "receive",
      label: "Record finished",
      short: "If tracked",
      description: "Only needed when the finished product uses serial or lot numbers.",
      detail: "Skip if the finished product is plain qty. Otherwise record serials/lots before Finish.",
      href: "/app/production/receive-station",
      routePrefixes: ["/app/production/receive-station"],
      optional: true,
    },
    {
      id: "qc",
      label: "Quality check",
      short: "If required",
      description: "Pass quality check when your company requires it before Finish.",
      detail: "Use Pass quality check on the Jobs list if the Finish button is blocked.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
      onJobsRow: true,
      optional: true,
    },
    {
      id: "complete",
      label: "Finish",
      short: "Update stock",
      description: "Posts stock: parts out, finished product in.",
      detail: "Click Finish on the job row. Stock updates when this succeeds.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "pack",
      label: "Pack",
      short: "Optional",
      description: "Pack serials into cartons when you use serial tracking.",
      detail: "After Finish, some jobs offer Pack in Inventory → Serial & Lot.",
      href: "/app/inventory/serial-lot/pack-station",
      routePrefixes: ["/app/inventory/serial-lot/pack-station"],
      optional: true,
    },
    {
      id: "sell",
      label: "Deliver / invoice",
      short: "Optional",
      description: "Ship or invoice the finished product.",
      detail: "Use Sales Order, shipping, or Sales as usual after stock is in.",
      href: "/app/sales/sales",
      routePrefixes: ["/app/sales", "/app/shipping"],
      optional: true,
    },
    {
      id: "reports",
      label: "Reports",
      short: "Review",
      description: "See job status and stock movements.",
      detail: "Production → Reports for job status and movements.",
      href: "/app/production/reports",
      routePrefixes: ["/app/production/reports"],
    },
  ],
};

const DISASSEMBLY_FLOW: ProductionFlow = {
  mode: "disassembly",
  title: "Disassembly",
  tagline: "Take one item apart into sellable parts.",
  steps: [
    {
      id: "sales_order",
      label: "Sales order",
      short: "Optional",
      description: "Optional — most take-apart jobs are not tied to a customer order.",
      detail: "Link a sales order only if you need to.",
      href: "/app/sales-order/sales-orders",
      routePrefixes: ["/app/sales-order"],
      optional: true,
    },
    {
      id: "recipe",
      label: "Recipe",
      short: "What comes out",
      description: "The item you take apart and the parts you get.",
      detail:
        "Disassembly → Recipes: pick the whole item, list parts and how many of each. Leave Advanced yield fields alone.",
      href: "/app/production/disassembly/recipes",
      routePrefixes: ["/app/production/disassembly/recipes"],
    },
    {
      id: "job",
      label: "Job",
      short: "How many",
      description: "Create a draft job for how many wholes to process.",
      detail: "Disassembly → Jobs → New job: pick recipe and quantity, then Start job.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
    },
    {
      id: "release",
      label: "Start job",
      short: "Begin",
      description: "Start the job so you can record parts and finish.",
      detail: "On the Jobs list, click Start job.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "issue",
      label: "Take from stock",
      short: "If tracked",
      description: "Only needed when the whole item uses serial or lot numbers.",
      detail: "If the whole is plain qty, skip this and go to Record parts.",
      href: "/app/production/issue-station?mode=disassembly",
      routePrefixes: ["/app/production/issue-station"],
      optional: true,
    },
    {
      id: "weigh",
      label: "Record parts",
      short: "Enter qty",
      description: "Enter how many of each part you got.",
      detail: "Open Record parts on the job row. Finish afterward to put parts in stock.",
      href: "/app/production/weigh-parts",
      routePrefixes: ["/app/production/weigh-parts"],
    },
    {
      id: "qc",
      label: "Quality check",
      short: "If required",
      description: "Pass quality check when your company requires it before Finish.",
      detail: "Use Pass quality check on the Jobs list if Finish is blocked.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
      onJobsRow: true,
      optional: true,
    },
    {
      id: "complete",
      label: "Finish",
      short: "Update stock",
      description: "Whole out, parts in.",
      detail: "Click Finish. Stock updates when this succeeds.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "reports",
      label: "Reports",
      short: "Review",
      description: "See yield and stock movements.",
      detail: "Production → Reports for take-apart results.",
      href: "/app/production/reports",
      routePrefixes: ["/app/production/reports"],
    },
  ],
};

export const PRODUCTION_FLOWS: Record<MfgMode, ProductionFlow> = {
  assembly: ASSEMBLY_FLOW,
  disassembly: DISASSEMBLY_FLOW,
};

/** Pick the best-matching step for highlighting "You are here". */
export function activeFlowStepIndex(pathname: string, search: string, flow: ProductionFlow): number {
  const path = pathname.toLowerCase();
  const params = new URLSearchParams(search);
  const disassemblyReceive =
    path.startsWith("/app/production/receive-station") && params.get("mode") === "disassembly";

  let best = -1;
  let bestLen = -1;
  flow.steps.forEach((step, i) => {
    for (const prefix of step.routePrefixes) {
      const p = prefix.toLowerCase();
      if (p.includes("receive-station") && step.id === "receive" && flow.mode === "disassembly") {
        if (!disassemblyReceive) continue;
      }
      if (p.includes("receive-station") && step.id === "receive" && flow.mode === "assembly") {
        if (disassemblyReceive) continue;
      }
      if (path === p || path.startsWith(`${p}/`) || (path.startsWith(p) && p.endsWith(path.slice(p.length)))) {
        if (p.length > bestLen) {
          bestLen = p.length;
          best = i;
        }
      } else if (path.startsWith(p)) {
        if (p.length > bestLen) {
          bestLen = p.length;
          best = i;
        }
      }
    }
  });
  return best;
}

export function isProductionHubPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "");
  return p === "/app/production";
}
