export type MfgMode = "assembly" | "disassembly" | "recipe" | "all";

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
    branchTitle: "Cutting / Breakdown",
    recipeTitle: "Cutting templates",
    jobTitle: "Cutting jobs",
    newRecipeTitle: "New Cutting template",
    newJobTitle: "New Cutting order",
    bomNameLabel: "Description",
    headerItemLabel: "Raw material (whole)",
    batchQtyLabel: "How many wholes per batch",
    lineSectionTitle: "Outputs you get",
    lineQtyLabel: "How many of this part",
    scrapLabel: "Loss allowance",
    showScrap: false,
    jobQtyLabel: "How many to cut",
    stockHint: "Whole leaves stock · cuts come in when you Post Production.",
    materialsInputLabel: "To take from stock",
    materialsOutputLabel: "Cuts you get",
    yieldLabel: "Yield %",
    yieldDescription: "Advanced: typical output vs input (100 = no loss).",
    expectedYieldMinLabel: "Expected yield min %",
    expectedYieldMinDescription: "Advanced: optional lower limit for reports.",
    expectedYieldMaxLabel: "Expected yield max %",
    expectedYieldMaxDescription: "Advanced: optional upper limit for reports.",
    addLineLabel: "Add output",
    bomGuideId: "mfg_bom_disassembly",
    jobGuideId: "mfg_work_order_disassembly",
    sequenceHint: "Save the template, then New Cutting order → enter actuals → Post Production.",
  },
  recipe: {
    branchTitle: "Recipe / Processing",
    recipeTitle: "Processing recipes",
    jobTitle: "Processing jobs",
    newRecipeTitle: "New Processing recipe",
    newJobTitle: "New Processing order",
    bomNameLabel: "Description",
    headerItemLabel: "Finished product",
    batchQtyLabel: "Batch size (finished units per batch)",
    lineSectionTitle: "Ingredients you use",
    lineQtyLabel: "Qty used",
    scrapLabel: "Extra / spare",
    showScrap: true,
    jobQtyLabel: "How many batches / units to process",
    stockHint: "Ingredients leave stock · finished product comes in when you Process & Post.",
    materialsInputLabel: "To take from stock",
    materialsOutputLabel: "You will get",
    yieldLabel: "Yield %",
    yieldDescription: "Advanced: expected finished qty vs ingredients (100 = no loss).",
    expectedYieldMinLabel: "Expected yield min %",
    expectedYieldMinDescription: "Advanced: optional lower limit for reports.",
    expectedYieldMaxLabel: "Expected yield max %",
    expectedYieldMaxDescription: "Advanced: optional upper limit for reports.",
    addLineLabel: "Add ingredient",
    bomGuideId: "mfg_bom_recipe",
    jobGuideId: "mfg_work_order_recipe",
    sequenceHint: "Save the recipe, then New Processing order → check ingredients → Process & Post.",
  },
  all: {
    branchTitle: "All production",
    recipeTitle: "Recipes",
    jobTitle: "All production",
    newRecipeTitle: "New recipe",
    newJobTitle: "New production order",
    bomNameLabel: "Description",
    headerItemLabel: "Product / input",
    batchQtyLabel: "Batch size",
    lineSectionTitle: "Lines",
    lineQtyLabel: "Qty",
    scrapLabel: "Extra",
    showScrap: true,
    jobQtyLabel: "Quantity",
    stockHint: "Stock changes only when you Finish / Assemble & Post / Post Production / Process & Post.",
    materialsInputLabel: "To take from stock",
    materialsOutputLabel: "You will get",
    yieldLabel: "Yield %",
    yieldDescription: "Advanced yield.",
    expectedYieldMinLabel: "Expected yield min %",
    expectedYieldMinDescription: "Optional.",
    expectedYieldMaxLabel: "Expected yield max %",
    expectedYieldMaxDescription: "Optional.",
    addLineLabel: "Add line",
    bomGuideId: "mfg_bom_assembly",
    jobGuideId: "mfg_work_order_assembly",
    sequenceHint: "Use Dashboard → Assembly, Cutting, or Recipe for the guided order wizards.",
  },
};

export function parseMfgMode(raw: string | undefined): MfgMode | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "assembly") return "assembly";
  if (s === "disassembly") return "disassembly";
  if (s === "recipe") return "recipe";
  if (s === "all") return "all";
  return null;
}

export function modeFromPath(pathname: string): MfgMode | null {
  const m = pathname.match(/\/app\/production\/(assembly|disassembly|recipe|all)(?:\/|$)/);
  return m ? parseMfgMode(m[1]) : null;
}

export function recipesHref(mode: MfgMode): string {
  if (mode === "all") return "/app/production/assembly/recipes";
  return `/app/production/${mode}/recipes`;
}

export function jobsHref(mode: MfgMode): string {
  return `/app/production/${mode}/jobs`;
}

export function bomTypeForMode(mode: MfgMode): "assembly" | "disassembly" | "recipe" | "" {
  if (mode === "all") return "";
  return mode;
}

export function newAssemblyOrderHref(): string {
  return "/app/production/orders/new";
}

export function newCuttingOrderHref(): string {
  return "/app/production/orders/new?type=cutting";
}

export function newRecipeOrderHref(): string {
  return "/app/production/orders/new?type=recipe";
}
