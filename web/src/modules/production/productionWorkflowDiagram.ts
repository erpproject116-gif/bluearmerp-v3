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
  tagline: "Raw materials in → finished product out (make-to-stock or make-to-order).",
  steps: [
    {
      id: "sales_order",
      label: "Sales order",
      short: "Optional demand",
      description: "Confirm what the customer ordered before you build.",
      detail:
        "Create or open a sales order. Use Create work order(s) on the SO, or on Assembly → Jobs use New job → Sales order… (Load Slip) to pull open SO lines with an active recipe.",
      href: "/app/sales-order/sales-orders",
      routePrefixes: ["/app/sales-order"],
      optional: true,
    },
    {
      id: "recipe",
      label: "Recipe",
      short: "BOM setup",
      description: "Define finished product, raw materials per batch, yield, and default location.",
      detail:
        "Assembly → Recipes: recipe code, description, finished product, raw materials (per batch), optional scrap and yield %. Save when the bill of materials matches how you actually build.",
      href: "/app/production/assembly/recipes",
      routePrefixes: ["/app/production/assembly/recipes"],
    },
    {
      id: "job",
      label: "Job",
      short: "Draft work order",
      description: "Create a draft job from the recipe (with or without a sales order link).",
      detail:
        "Assembly → Jobs → New job: pick recipe, quantity to produce, and location. Status stays Draft until you release. Review material needs on the row before releasing.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
    },
    {
      id: "release",
      label: "Release",
      short: "To floor",
      description: "Authorize production and reserve materials for the job.",
      detail:
        "On the Jobs list, click Next: Release to floor on the draft row (or bulk-release selected drafts). Released jobs show floor links for issue and receive.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "issue",
      label: "Issue materials",
      short: "Floor",
      description: "Take components from stock (scan serials/lots when tracked).",
      detail:
        "From a released job row, open Issue materials or use Production → Issue station. Quantities convert using recipe yield, scrap, and each item’s base UoM.",
      href: "/app/production/issue-station",
      routePrefixes: ["/app/production/issue-station"],
    },
    {
      id: "receive",
      label: "Receive FG",
      short: "Floor",
      description: "Record finished goods produced (and output serials/lots if tracked).",
      detail:
        "From the job row, open Receive FG or use Production → Receive station. Post output before completing when your process requires staged receipts.",
      href: "/app/production/receive-station",
      routePrefixes: ["/app/production/receive-station"],
    },
    {
      id: "qc",
      label: "FG QC",
      short: "Inspection",
      description: "Pass or hold finished-goods quality when policy requires it.",
      detail:
        "If Production → Setup has Require FG QC enabled, use Pass QC or Hold in the Inspection column on the Jobs list. Complete stays disabled while QC is pending or held.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "complete",
      label: "Complete",
      short: "Post stock",
      description: "Backflush remaining materials and receive finished goods into inventory.",
      detail:
        "Click Next: Complete on a released job (after QC if required). The live recipe is reloaded at complete time. Used qty becomes product; scrap is extra measurable loss in the same UoM.",
      href: "/app/production/assembly/jobs",
      routePrefixes: ["/app/production/assembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "pack",
      label: "Pack",
      short: "Optional",
      description: "Pack output serials into cartons when you use serial tracking.",
      detail:
        "After complete, some jobs show Next: Pack linking to Inventory → Serial & Lot → Pack station.",
      href: "/app/inventory/serial-lot/pack-station",
      routePrefixes: ["/app/inventory/serial-lot/pack-station"],
      optional: true,
    },
    {
      id: "sell",
      label: "Deliver / invoice",
      short: "Optional",
      description: "Ship or invoice finished goods to the customer.",
      detail:
        "Use Sales Order release, shipping orders, or New Sales with Load Slip → Sales Order to invoice delivered quantity. Completed WO qty may count toward SO release when enabled in Production → Setup.",
      href: "/app/sales/sales",
      routePrefixes: ["/app/sales", "/app/shipping"],
      optional: true,
    },
    {
      id: "reports",
      label: "Reports",
      short: "Audit",
      description: "Job status, progress, stock movements, and yield (disassembly tab separate).",
      detail:
        "Production → Reports: filter by date, status, and bom type. Use Job status to see source sales order links on make-to-order runs.",
      href: "/app/production/reports",
      routePrefixes: ["/app/production/reports"],
    },
  ],
};

const DISASSEMBLY_FLOW: ProductionFlow = {
  mode: "disassembly",
  title: "Disassembly",
  tagline: "Whole item in → cut pieces out (yield and catch-weight aware).",
  steps: [
    {
      id: "sales_order",
      label: "Sales order",
      short: "Optional",
      description: "Rare for cutting floors; use when building to a specific customer order.",
      detail:
        "Same as assembly: link jobs from the sales order or Load Slip on New job. Most disassembly is make-to-stock from whole carcasses or bulk input.",
      href: "/app/sales-order/sales-orders",
      routePrefixes: ["/app/sales-order"],
      optional: true,
    },
    {
      id: "recipe",
      label: "Recipe",
      short: "Cut BOM",
      description: "Whole/raw input, expected pieces per batch, yield min/max for reports.",
      detail:
        "Disassembly → Recipes: description, whole item, batch input qty, expected outputs per batch, and optional yield range. Min/max % flag short runs on yield reports.",
      href: "/app/production/disassembly/recipes",
      routePrefixes: ["/app/production/disassembly/recipes"],
    },
    {
      id: "job",
      label: "Job",
      short: "Draft",
      description: "Create a job for how many wholes you will process.",
      detail:
        "Disassembly → Jobs → New job: pick recipe and quantity to process. Review expected output from material needs before release.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
    },
    {
      id: "release",
      label: "Release",
      short: "To floor",
      description: "Release the whole item from stock to the cutting floor.",
      detail:
        "On the Jobs list, Next: Release to floor on the draft row. Floor links for Issue whole and Weigh cuts appear on released rows.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "issue",
      label: "Issue whole",
      short: "Floor",
      description: "Stage the whole/input lot or serial when the carcass is tracked.",
      detail:
        "Open Issue whole from the job row when the whole item tracks lots or serials. Required before Complete for tracked wholes.",
      href: "/app/production/issue-station?mode=disassembly",
      routePrefixes: ["/app/production/issue-station"],
    },
    {
      id: "weigh",
      label: "Weigh cuts",
      short: "Floor",
      description: "Weigh each cut SKU into a staged lot (catch-weight).",
      detail:
        "Open Weigh cuts from the job row or Production → Weigh parts. Cut items must be lot-tracked. Actual whole weight is entered on Complete.",
      href: "/app/production/weigh-parts",
      routePrefixes: ["/app/production/weigh-parts"],
    },
    {
      id: "qc",
      label: "FG QC",
      short: "Inspection",
      description: "Pass or hold output quality when FG QC policy is on.",
      detail:
        "Inspection column on Disassembly → Jobs — same as assembly. Complete is blocked until QC is not pending/held.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "complete",
      label: "Complete",
      short: "Post stock",
      description: "Consume the whole, post cut pieces, and close the job.",
      detail:
        "Next: Complete posts disassembly receipts (wo_disassembly_receipt movements) and consumes the whole. Yield report compares planned vs actual per component.",
      href: "/app/production/disassembly/jobs",
      routePrefixes: ["/app/production/disassembly/jobs"],
      onJobsRow: true,
    },
    {
      id: "reports",
      label: "Reports",
      short: "Yield audit",
      description: "Disassembly yield tab plus job status and stock movement reports.",
      detail:
        "Production → Reports → Disassembly yield for planned vs actual by component. Job status shows linked source SO when applicable.",
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
