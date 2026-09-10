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
    batchQtyLabel: "How many finished units this recipe makes",
    lineSectionTitle: "Parts you use",
    lineQtyLabel: "Qty used",
    scrapLabel: "Extra / spare",
    showScrap: true,
    jobQtyLabel: "How many to make",
    stockHint: "Parts leave stock · finished product comes in when you Finish.",
    materialsInputLabel: "To take from stock",
    materialsOutputLabel: "You will get",
    yieldLabel: "Yield %",
    yieldDescription: "Advanced: how much output you expect vs materials (100 = no loss).",
    expectedYieldMinLabel: "Expected yield min %",
    expectedYieldMinDescription: "Advanced: optional lower limit for reports.",
    expectedYieldMaxLabel: "Expected yield max %",
    expectedYieldMaxDescription: "Advanced: optional upper limit for reports.",
    addLineLabel: "Add part",
    bomGuideId: "mfg_bom_assembly",
    jobGuideId: "mfg_work_order_assembly",
    sequenceHint: "Save the recipe, then open Jobs → Start job → take parts if needed → Finish.",
  },
  disassembly: {
    branchTitle: "Disassembly",
    recipeTitle: "Disassembly recipes",
    jobTitle: "Disassembly jobs",
    newRecipeTitle: "New Disassembly recipe",
    newJobTitle: "New Disassembly job",
    bomNameLabel: "Description",
    headerItemLabel: "Item you are taking apart",
    batchQtyLabel: "How many wholes per batch",
    lineSectionTitle: "Parts you get",
    lineQtyLabel: "How many of this part",
    scrapLabel: "Loss allowance",
    showScrap: false,
    jobQtyLabel: "How many to take apart",
    stockHint: "Whole leaves stock · parts come in when you Finish.",
    materialsInputLabel: "To take from stock",
    materialsOutputLabel: "Parts you get",
    yieldLabel: "Yield %",
    yieldDescription: "Advanced: typical output vs input (100 = no loss).",
    expectedYieldMinLabel: "Expected yield min %",
    expectedYieldMinDescription: "Advanced: optional lower limit for reports.",
    expectedYieldMaxLabel: "Expected yield max %",
    expectedYieldMaxDescription: "Advanced: optional upper limit for reports.",
    addLineLabel: "Add part",
    bomGuideId: "mfg_bom_disassembly",
    jobGuideId: "mfg_work_order_disassembly",
    sequenceHint: "Save the recipe, then open Jobs → Start job → record parts → Finish.",
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
