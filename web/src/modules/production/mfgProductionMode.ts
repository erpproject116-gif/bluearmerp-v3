export type MfgMode = "assembly" | "disassembly";

export type MfgCopy = {
  branchTitle: string;
  recipeTitle: string;
  jobTitle: string;
  newRecipeTitle: string;
  newJobTitle: string;
  bomNameLabel: string;
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
  yieldLabel: string;
  yieldDescription: string;
  expectedYieldMinLabel: string;
  expectedYieldMinDescription: string;
  expectedYieldMaxLabel: string;
  expectedYieldMaxDescription: string;
  addLineLabel: string;
  bomGuideId: string;
  jobGuideId: string;
  sequenceHint: string;
};

export const MFG_COPY: Record<MfgMode, MfgCopy> = {
  assembly: {
    branchTitle: "Assembly",
    recipeTitle: "Assembly recipes",
    jobTitle: "Assembly jobs",
    newRecipeTitle: "New Assembly recipe",
    newJobTitle: "New Assembly job",
    bomNameLabel: "Description",
    headerItemLabel: "Finished product",
    batchQtyLabel: "Batch output qty",
    lineSectionTitle: "Raw materials (per batch)",
    lineQtyLabel: "Qty used",
    scrapLabel: "Scrap / spare",
    showScrap: true,
    jobQtyLabel: "Quantity to produce",
    stockHint: "Parts out · finished product in",
    materialsInputLabel: "To issue from stock",
    materialsOutputLabel: "Will receive",
    yieldLabel: "Yield %",
    yieldDescription:
      "Expected output vs materials for one batch (100 = no loss). Used when scaling how much stock a job consumes.",
    expectedYieldMinLabel: "Expected yield min %",
    expectedYieldMinDescription: "Optional lower tolerance for yield reports (assembly recipes rarely need this).",
    expectedYieldMaxLabel: "Expected yield max %",
    expectedYieldMaxDescription: "Optional upper tolerance for yield reports (assembly recipes rarely need this).",
    addLineLabel: "Add material",
    bomGuideId: "mfg_bom_assembly",
    jobGuideId: "mfg_work_order_assembly",
    sequenceHint:
      "After the recipe: open Jobs → create a draft → Release to floor → issue materials & receive FG → Pass QC → Complete.",
  },
  disassembly: {
    branchTitle: "Disassembly",
    recipeTitle: "Disassembly recipes",
    jobTitle: "Disassembly jobs",
    newRecipeTitle: "New Disassembly recipe",
    newJobTitle: "New Disassembly job",
    bomNameLabel: "Description",
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
    yieldLabel: "Yield %",
    yieldDescription:
      "Typical output weight or qty you expect from one whole item, as a percent of input (100 = no loss).",
    expectedYieldMinLabel: "Expected yield min %",
    expectedYieldMinDescription:
      "Lowest acceptable yield for this cut (e.g. 82). Used on yield reports to flag short runs.",
    expectedYieldMaxLabel: "Expected yield max %",
    expectedYieldMaxDescription:
      "Highest expected yield (e.g. 88). Pair with min % to set the normal range for floor QC.",
    addLineLabel: "Add output",
    bomGuideId: "mfg_bom_disassembly",
    jobGuideId: "mfg_work_order_disassembly",
    sequenceHint:
      "After the recipe: open Jobs → create a draft → Release → weigh whole & receive pieces → Pass QC → Complete.",
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
