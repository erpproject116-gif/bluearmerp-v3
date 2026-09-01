export type MfgMode = "assembly" | "disassembly";

export type MfgCopy = {
  branchTitle: string;
  recipeTitle: string;
  jobTitle: string;
  newRecipeTitle: string;
  newJobTitle: string;
  headerItemLabel: string;
  batchQtyLabel: string;
  lineSectionTitle: string;
  lineQtyLabel: string;
  scrapLabel: string;
  showScrap: boolean;
  jobQtyLabel: string;
  stockHint: string;
  materialsInputLabel: string;
  materialsOutputLabel: string;
  bomGuideId: string;
  jobGuideId: string;
};

export const MFG_COPY: Record<MfgMode, MfgCopy> = {
  assembly: {
    branchTitle: "Assembly",
    recipeTitle: "Assembly recipes",
    jobTitle: "Assembly jobs",
    newRecipeTitle: "New Assembly recipe",
    newJobTitle: "New Assembly job",
    headerItemLabel: "Finished item",
    batchQtyLabel: "Batch output qty",
    lineSectionTitle: "Raw materials (per batch)",
    lineQtyLabel: "Qty used",
    scrapLabel: "Scrap / spare",
    showScrap: true,
    jobQtyLabel: "Quantity to produce",
    stockHint: "Parts out · finished product in",
    materialsInputLabel: "To issue from stock",
    materialsOutputLabel: "Will receive",
    bomGuideId: "mfg_bom_assembly",
    jobGuideId: "mfg_work_order_assembly",
  },
  disassembly: {
    branchTitle: "Disassembly",
    recipeTitle: "Disassembly recipes",
    jobTitle: "Disassembly jobs",
    newRecipeTitle: "New Disassembly recipe",
    newJobTitle: "New Disassembly job",
    headerItemLabel: "Whole / raw item",
    batchQtyLabel: "Batch input qty",
    lineSectionTitle: "Outputs (per batch)",
    lineQtyLabel: "Expected qty",
    scrapLabel: "Loss allowance",
    showScrap: false,
    jobQtyLabel: "Quantity to process",
    stockHint: "Whole out · pieces in",
    materialsInputLabel: "To take from stock",
    materialsOutputLabel: "Expected output",
    bomGuideId: "mfg_bom_disassembly",
    jobGuideId: "mfg_work_order_disassembly",
  },
};

export function parseMfgMode(raw: string | undefined): MfgMode | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "assembly") return "assembly";
  if (s === "disassembly") return "disassembly";
  return null;
}

export function modeFromPath(pathname: string): MfgMode | null {
  const m = pathname.match(/\/app\/production\/(assembly|disassembly)(?:\/|$)/);
  return m ? parseMfgMode(m[1]) : null;
}

export function recipesHref(mode: MfgMode): string {
  return `/app/production/${mode}/recipes`;
}

export function jobsHref(mode: MfgMode): string {
  return `/app/production/${mode}/jobs`;
}

export function bomTypeForMode(mode: MfgMode): MfgMode {
  return mode;
}
