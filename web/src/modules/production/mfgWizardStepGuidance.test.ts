import { describe, expect, it } from "vitest";
import { cuttingStepGuidance, recipeAssemblyStepGuidance } from "./mfgWizardStepGuidance";

describe("recipeAssemblyStepGuidance", () => {
  it("shows shortage on step 2 without blocking draft language", () => {
    const g = recipeAssemblyStepGuidance(2, {
      hasShortage: true,
      postBlockedLabel: "Process & Post",
      takeMaterialsNext: false,
    });
    expect(g.stock).toContain("save the draft");
  });

  it("shows take materials hint on step 3 when tracked", () => {
    const g = recipeAssemblyStepGuidance(3, {
      hasShortage: false,
      postBlockedLabel: "Process & Post",
      takeMaterialsNext: true,
    });
    expect(g.take_materials).toContain("Take materials");
  });
});

describe("cuttingStepGuidance", () => {
  it("requires waste reason for extra waste qty", () => {
    const g = cuttingStepGuidance(2, {
      hasInputShortage: false,
      inputTracked: false,
      wasteReasonId: null,
      wasteQty: 2,
      wasteLines: [],
      reasons: [],
    });
    expect(g.waste).toContain("waste reason");
  });
});
